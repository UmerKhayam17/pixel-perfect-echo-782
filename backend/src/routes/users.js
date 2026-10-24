import { Router } from "express";
import { Session } from "../models/Session.js";
import mongoose from "mongoose";
import { Lead } from "../models/Lead.js";
import { Task } from "../models/Task.js";
import { ROLES, User } from "../models/User.js";
import { PERMISSIONS, leadScope } from "../services/access.js";
import { notify } from "../services/notify.js";
import { hashPassword, passwordProblem } from "../services/security.js";

// Team management — mounted behind requireAdmin.
export const usersRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True if removing admin rights from `user` would leave nobody able to manage the workspace. */
async function isLastAdmin(user) {
  if (user.role !== "admin" || !user.active) return false;
  return (await User.countDocuments({ role: "admin", active: true })) <= 1;
}

usersRouter.get("/", async (_req, res) => {
  const users = await User.find().sort({ createdAt: 1 });
  // How many leads each member can see, so admins can check access at a glance.
  const counts = await Promise.all(users.map((u) => (u.role === "admin" ? Lead.estimatedDocumentCount() : Lead.countDocuments(leadScope(u)))));
  // Workload: leads each person owns (open = not won/lost) and their open / overdue tasks.
  const [owned, tasks] = await Promise.all([
    Lead.aggregate([
      { $match: { assignedTo: { $ne: null } } },
      { $group: { _id: "$assignedTo", owned: { $sum: 1 }, open: { $sum: { $cond: [{ $in: ["$stage", ["won", "lost"]] }, 0, 1] } } } },
    ]),
    Task.aggregate([
      { $match: { done: false, assignedTo: { $ne: null } } },
      { $group: { _id: "$assignedTo", open: { $sum: 1 }, overdue: { $sum: { $cond: [{ $and: [{ $ne: ["$dueAt", null] }, { $lt: ["$dueAt", new Date()] }] }, 1, 0] } } } },
    ]),
  ]);
  const ownedBy = new Map(owned.map((o) => [String(o._id), o]));
  const tasksBy = new Map(tasks.map((t) => [String(t._id), t]));
  res.json(
    users.map((u, i) => {
      const o = ownedBy.get(String(u._id));
      const t = tasksBy.get(String(u._id));
      return {
        ...u.toJSON(),
        visibleLeads: counts[i],
        workload: { ownedLeads: o?.owned ?? 0, openLeads: o?.open ?? 0, openTasks: t?.open ?? 0, overdueTasks: t?.overdue ?? 0 },
      };
    }),
  );
});

// Adds a teammate with a temporary password they must change when they first sign in.
usersRouter.post("/", async (req, res) => {
  const body = req.body ?? {};
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const role = ROLES.includes(body.role) ? body.role : "member";
  const password = String(body.password ?? "");
  const errors = {};
  if (!name) errors.name = "Enter their name.";
  if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";
  else if (await User.exists({ email })) errors.email = "Someone already uses this email.";
  const problem = passwordProblem(password, { email, name });
  if (problem) errors.password = problem;
  if (Object.keys(errors).length) return res.status(400).json({ error: "Please fix the highlighted fields.", errors });

  const user = await User.create({ name, email, role, passwordHash: await hashPassword(password), mustChangePassword: true });
  res.status(201).json(user);
});

usersRouter.put("/:id", async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const body = req.body ?? {};
  const self = String(user._id) === String(req.user._id);

  if ("name" in body) {
    const name = String(body.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "Enter their name." });
    user.name = name;
  }
  const demoting = "role" in body && body.role !== "admin" && user.role === "admin";
  const deactivating = body.active === false && user.active;
  if ((demoting || deactivating) && self) return res.status(400).json({ error: "You can't remove your own admin access or deactivate yourself." });
  if ((demoting || deactivating) && (await isLastAdmin(user))) {
    return res.status(400).json({ error: "This is the only active admin. Make someone else an admin first." });
  }
  if ("role" in body) {
    if (!ROLES.includes(body.role)) return res.status(400).json({ error: `Role must be one of ${ROLES.join(", ")}.` });
    user.role = body.role;
  }
  if ("active" in body) user.active = Boolean(body.active);
  const before = new Set([...(user.access?.searchIds ?? []), ...(user.access?.importIds ?? [])].map(String));
  if (body.access && typeof body.access === "object") {
    const ids = (v) => (Array.isArray(v) ? v.filter((id) => mongoose.isValidObjectId(id)) : []);
    if ("searchIds" in body.access) user.set("access.searchIds", ids(body.access.searchIds));
    if ("importIds" in body.access) user.set("access.importIds", ids(body.access.importIds));
  }
  if (body.permissions && typeof body.permissions === "object") {
    for (const p of PERMISSIONS) if (p in body.permissions) user.set(`permissions.${p}`, Boolean(body.permissions[p]));
  }
  await user.save();
  if (!user.active) await Session.deleteMany({ userId: user._id });
  const added = [...(user.access?.searchIds ?? []), ...(user.access?.importIds ?? [])].filter((id) => !before.has(String(id)));
  if (added.length && user.role === "member") {
    await notify(user._id, {
      type: "campaign_shared",
      title: `${added.length} new campaign${added.length === 1 ? "" : "s"} shared with you`,
      body: `By ${req.user.name} · you can now work these leads`,
      link: "/leads",
    });
  }
  res.json(user);
});

// Sets a temporary password; the user must change it at next sign-in. Signs them out everywhere.
usersRouter.post("/:id/password", async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const password = String(req.body?.password ?? "");
  const problem = passwordProblem(password, user);
  if (problem) return res.status(400).json({ error: problem, errors: { password: problem } });
  user.passwordHash = await hashPassword(password);
  user.mustChangePassword = String(user._id) !== String(req.user._id);
  user.passwordChangedAt = new Date();
  await user.save();
  await Session.deleteMany({ userId: user._id, _id: { $ne: req.session._id } });
  res.json(user);
});

usersRouter.delete("/:id", async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (String(user._id) === String(req.user._id)) return res.status(400).json({ error: "You can't delete your own account." });
  if (await isLastAdmin(user)) return res.status(400).json({ error: "This is the only active admin. Make someone else an admin first." });
  await Session.deleteMany({ userId: user._id });
  await user.deleteOne();
  res.status(204).end();
});
