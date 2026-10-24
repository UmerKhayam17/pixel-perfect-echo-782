import { Router } from "express";
import mongoose from "mongoose";
import { clientIp, rateLimit, requireAuth, signIn, signOut } from "../middleware/auth.js";
import { Session } from "../models/Session.js";
import { User } from "../models/User.js";
import { logAuth } from "../services/audit.js";
import { hashPassword, passwordProblem, verifyDummy, verifyPassword } from "../services/security.js";

export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normEmail = (v) => String(v ?? "").trim().toLowerCase();

// Brute-force protection: per address and per IP.
const loginByEmail = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  key: (req) => `email:${normEmail(req.body?.email)}`,
  message: "Too many sign-in attempts for this account. Try again in 15 minutes.",
});
const loginByIp = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  key: (req) => `ip:${clientIp(req)}`,
  message: "Too many sign-in attempts from this network. Try again in 15 minutes.",
});

/**
 * What the app needs on load: who is signed in, and whether any account exists yet. Accounts are
 * never created from here — the first admin is made with `npm run admin -- create` on the server,
 * and admins add everyone else from the Team page.
 */
authRouter.get("/status", async (req, res) => {
  const setupRequired = !(await User.exists({}));
  res.json({ setupRequired, user: req.user ?? null });
});

authRouter.post("/login", loginByIp, loginByEmail, async (req, res) => {
  const email = normEmail(req.body?.email);
  const password = String(req.body?.password ?? "");
  const user = email ? await User.findOne({ email }) : null;
  const ok = user ? await verifyPassword(password, user.passwordHash) : await verifyDummy(password);
  // Same message whether the email or the password was wrong.
  if (!ok || !user) {
    await logAuth(req, user, `Failed sign-in attempt for ${email || "(no email)"}`, { email, action: "auth.failed" });
    return res.status(401).json({ error: "Incorrect email or password." });
  }
  if (!user.active) {
    await logAuth(req, user, "Sign-in blocked — account deactivated", { action: "auth.blocked" });
    return res.status(403).json({ error: "This account has been deactivated. Ask an admin to restore it." });
  }

  loginByEmail.reset(req);
  user.lastLoginAt = new Date();
  await user.save();
  await signIn(req, res, user, req.body?.remember === true);
  await logAuth(req, user, "Signed in", { action: "auth.signin" });
  res.json({ user });
});

authRouter.post("/logout", async (req, res) => {
  if (req.user) await logAuth(req, req.user, "Signed out", { action: "auth.signout" });
  await signOut(req, res);
  res.status(204).end();
});

// Everything below needs a session, but still works while a password change is pending.
authRouter.use((req, res, next) => (req.user ? next() : res.status(401).json({ error: "Please sign in.", code: "unauthenticated" })));

authRouter.get("/me", (req, res) => res.json({ user: req.user }));

authRouter.put("/me", requireAuth, async (req, res) => {
  const user = req.user;
  const body = req.body ?? {};
  const errors = {};
  if ("name" in body) {
    const name = String(body.name ?? "").trim();
    if (name) user.name = name;
    else errors.name = "Enter your name.";
  }
  if ("email" in body && normEmail(body.email) !== user.email) {
    const email = normEmail(body.email);
    if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";
    else if (!(await verifyPassword(String(body.currentPassword ?? ""), user.passwordHash))) {
      errors.currentPassword = "Enter your current password to change your email.";
    } else if (await User.exists({ email, _id: { $ne: user._id } })) errors.email = "Another account uses this email.";
    else user.email = email;
  }
  if (Object.keys(errors).length) return res.status(400).json({ error: "Please fix the highlighted fields.", errors });
  await user.save();
  res.json({ user });
});

authRouter.post("/password", async (req, res) => {
  const user = req.user;
  const current = String(req.body?.currentPassword ?? "");
  const next = String(req.body?.newPassword ?? "");
  if (!(await verifyPassword(current, user.passwordHash))) {
    return res.status(400).json({ error: "Current password is incorrect.", errors: { currentPassword: "Current password is incorrect." } });
  }
  const problem = passwordProblem(next, user) ?? (current === next ? "Choose a password different from the current one." : null);
  if (problem) return res.status(400).json({ error: problem, errors: { newPassword: problem } });

  user.passwordHash = await hashPassword(next);
  user.mustChangePassword = false;
  user.passwordChangedAt = new Date();
  await user.save();
  // Everyone else signed in as this user is signed out.
  await Session.deleteMany({ userId: user._id, _id: { $ne: req.session._id } });
  res.json({ user });
});

authRouter.get("/sessions", async (req, res) => {
  const sessions = await Session.find({ userId: req.user._id, expiresAt: { $gt: new Date() } }).sort({ lastSeenAt: -1 });
  res.json(sessions.map((s) => ({ ...s.toJSON(), current: String(s._id) === String(req.session._id) })));
});

// Signs out every other browser.
authRouter.delete("/sessions", async (req, res) => {
  const result = await Session.deleteMany({ userId: req.user._id, _id: { $ne: req.session._id } });
  res.json({ signedOut: result.deletedCount });
});

authRouter.delete("/sessions/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
  const result = await Session.deleteOne({ _id: req.params.id, userId: req.user._id });
  if (result.deletedCount === 0) return res.status(404).json({ error: "Session not found" });
  res.status(204).end();
});
