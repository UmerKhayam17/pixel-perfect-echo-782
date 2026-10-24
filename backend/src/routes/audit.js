import { Router } from "express";
import mongoose from "mongoose";
import { requireAdmin } from "../middleware/auth.js";
import { Activity } from "../models/Activity.js";
import { AuditLog } from "../models/AuditLog.js";
import { User } from "../models/User.js";
import { activeMinutes, logAudit } from "../services/audit.js";

export const auditRouter = Router();

const MAX_EVENTS = 60;
const str = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Page views and clicks reported by the app, in batches. Only labels of buttons/links and page
 * paths are accepted — never typed text.
 */
auditRouter.post("/events", async (req, res) => {
  const events = Array.isArray(req.body?.events) ? req.body.events.slice(0, MAX_EVENTS) : [];
  const now = Date.now();
  const docs = events
    .filter((e) => ["page", "click"].includes(e?.kind) && str(e.label, 1))
    .map((e) => {
      const at = Number(new Date(e.at));
      // Accept timestamps from the last 15 minutes only (clocks drift, queues flush late).
      const createdAt = Number.isFinite(at) && at <= now + 60_000 && at >= now - 15 * 60_000 ? new Date(at) : new Date(now);
      const leadId = str(e.path, 300).match(/^\/leads\/(\w{24})/)?.[1];
      return {
        userId: req.user._id,
        userName: req.user.name,
        role: req.user.role,
        kind: e.kind,
        action: e.kind === "page" ? "page.view" : "ui.click",
        label: e.kind === "page" ? `Opened ${str(e.label, 120)}` : `Clicked “${str(e.label, 100)}”`,
        path: str(e.path, 300),
        target: leadId ? { type: "lead", id: leadId, label: null } : undefined,
        createdAt,
      };
    });
  if (docs.length) await AuditLog.insertMany(docs, { ordered: false }).catch(() => undefined);
  res.status(204).end();
});

// Everything below is for admins.
auditRouter.use(requireAdmin);

function range(query) {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 86400000);
  return { from, to };
}

/** The trail, newest first. Filters: userId, kind (comma list), targetId, q (text), from/to, before (cursor). */
auditRouter.get("/", async (req, res) => {
  const filter = {};
  if (mongoose.isValidObjectId(req.query.userId)) filter.userId = req.query.userId;
  const kinds = String(req.query.kind ?? "").split(",").filter((k) => ["action", "page", "click", "auth"].includes(k));
  if (kinds.length) filter.kind = { $in: kinds };
  if (req.query.targetId) filter["target.id"] = String(req.query.targetId);
  if (req.query.q) filter.label = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const created = {};
  if (req.query.from) created.$gte = new Date(req.query.from);
  if (req.query.to) created.$lte = new Date(req.query.to);
  if (req.query.before) created.$lt = new Date(req.query.before);
  if (Object.keys(created).length) filter.createdAt = created;
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const items = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(limit);
  res.json({ items, next: items.length === limit ? items.at(-1).createdAt : null });
});

/** Per-person totals for a period: active time, pages, clicks, changes, leads worked and outreach. */
auditRouter.get("/summary", async (req, res) => {
  const { from, to } = range(req.query);
  const [users, entries, activities] = await Promise.all([
    User.find({}, { name: 1, email: 1, role: 1, active: 1, lastLoginAt: 1, lastSeenAt: 1 }).sort({ createdAt: 1 }),
    AuditLog.find({ createdAt: { $gte: from, $lte: to }, userId: { $ne: null } }, { userId: 1, kind: 1, action: 1, createdAt: 1, "target.id": 1, status: 1 }).sort({ createdAt: 1 }).lean(),
    Activity.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, userId: { $ne: null } } },
      { $group: { _id: { userId: "$userId", type: "$type", won: { $eq: ["$meta.to", "won"] } }, count: { $sum: 1 } } },
    ]),
  ]);

  const byUser = new Map(users.map((u) => [String(u._id), { times: [], pages: 0, clicks: 0, changes: 0, refused: 0, viewed: new Set(), worked: new Set(), exports: 0 }]));
  for (const e of entries) {
    const s = byUser.get(String(e.userId));
    if (!s) continue;
    s.times.push(new Date(e.createdAt).getTime());
    if (e.kind === "page") s.pages++;
    else if (e.kind === "click") s.clicks++;
    else if (e.kind === "action") {
      if (e.status >= 400) s.refused++;
      else if (e.action === "lead.view") s.viewed.add(e.target?.id);
      else s.changes++;
      if (e.action?.startsWith("lead.") && e.action !== "lead.view" && e.target?.id) s.worked.add(e.target.id);
      if (e.action === "leads.export" || e.action === "export.file") s.exports++;
    }
  }
  const outreach = new Map();
  for (const a of activities) {
    const key = String(a._id.userId);
    const o = outreach.get(key) ?? { call: 0, email: 0, whatsapp: 0, meeting: 0, note: 0, stage_change: 0, won: 0 };
    o[a._id.type] = (o[a._id.type] ?? 0) + a.count;
    if (a._id.type === "stage_change" && a._id.won) o.won += a.count;
    outreach.set(key, o);
  }

  res.json({
    from,
    to,
    users: users.map((u) => {
      const s = byUser.get(String(u._id));
      return {
        user: u.toJSON(),
        activeMinutes: activeMinutes(s.times),
        firstAt: s.times.length ? new Date(s.times[0]) : null,
        lastAt: s.times.length ? new Date(s.times.at(-1)) : null,
        pages: s.pages,
        clicks: s.clicks,
        changes: s.changes,
        refused: s.refused,
        exports: s.exports,
        leadsViewed: s.viewed.size,
        leadsWorked: s.worked.size,
        outreach: outreach.get(String(u._id)) ?? { call: 0, email: 0, whatsapp: 0, meeting: 0, note: 0, stage_change: 0, won: 0 },
      };
    }),
  });
});

/** Who did what with one lead (views and changes), newest first. */
auditRouter.get("/lead/:id", async (req, res) => {
  res.json(await AuditLog.find({ "target.id": String(req.params.id), kind: { $in: ["action", "page"] } }).sort({ createdAt: -1 }).limit(200));
});

export { logAudit };
