import { Router } from "express";
import mongoose from "mongoose";
import { Activity } from "../models/Activity.js";
import { Campaign } from "../models/Campaign.js";
import { LEAD_STAGES, Lead } from "../models/Lead.js";
import { Search } from "../models/Search.js";
import { Task } from "../models/Task.js";
import { User } from "../models/User.js";
import { isAdmin, scoped, searchScope } from "../services/access.js";

/**
 * Reports for a date range. Members see their own work on their own leads; admins see the whole
 * team and can narrow to one staff member (userId) and/or one campaign (searchId).
 */
export const reportsRouter = Router();

const DAY = 86400000;
const CONTACT = ["call", "email", "whatsapp", "meeting"];
const oid = (v) => (mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const and = (...parts) => {
  const list = parts.filter((p) => p && Object.keys(p).length);
  return list.length ? (list.length === 1 ? list[0] : { $and: list }) : {};
};

/** Buckets timestamps by local day, or by week (Monday) for long ranges. */
function bucketer(from, to, tzOffsetMinutes) {
  const weekly = (to - from) / DAY > 45;
  const keyOf = (date) => {
    const local = new Date(new Date(date).getTime() - tzOffsetMinutes * 60000);
    if (weekly) local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
    return local.toISOString().slice(0, 10);
  };
  const keys = [];
  for (let t = from.getTime(); t < to.getTime(); t += weekly ? 7 * DAY : DAY) {
    const k = keyOf(t);
    if (!keys.includes(k)) keys.push(k);
  }
  const last = keyOf(to.getTime() - 1);
  if (!keys.includes(last)) keys.push(last);
  return { weekly, keys, keyOf };
}

reportsRouter.get("/", async (req, res) => {
  const tz = Number(req.query.tzOffset) || 0;
  const to = req.query.to ? new Date(req.query.to) : new Date();
  const from = req.query.from ? new Date(req.query.from) : new Date(to.getTime() - 30 * DAY);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) return res.status(400).json({ error: "Invalid date range" });

  const admin = isAdmin(req.user);
  // Members always report on themselves; admins on everyone or one person.
  const staffId = admin ? oid(req.query.userId) : req.user._id;
  const searchId = oid(req.query.searchId);
  const range = { $gte: from, $lt: to };

  // Leads in scope: what the user may see, optionally one campaign and/or one owner.
  const leadMatch = and(scoped(req.user), searchId ? { searchIds: searchId } : null, admin && staffId ? { assignedTo: staffId } : null);
  const restrictLeads = Object.keys(leadMatch).length > 0;
  const leadIds = restrictLeads ? await Lead.distinct("_id", leadMatch) : null;
  const onLeads = restrictLeads ? { leadId: { $in: leadIds } } : {};
  // Work done: by the person when one is chosen (always for members).
  const byStaff = staffId ? { userId: staffId } : {};
  const workMatch = and({ createdAt: range }, byStaff, searchId ? onLeads : null);

  const { weekly, keys, keyOf } = bucketer(from, to, tz);
  const [newLeads, work, wonActs, lostActs, replies, openPipeline, funnel, tasksDone, noWhatsapp] = await Promise.all([
    Lead.find(and(leadMatch, { createdAt: range }), { createdAt: 1 }).lean(),
    Activity.find(and(workMatch, { type: { $in: CONTACT } }), { type: 1, leadId: 1, createdAt: 1 }).lean(),
    Activity.find(and(workMatch, { type: "stage_change", "meta.to": "won" }), { leadId: 1, createdAt: 1 }).lean(),
    Activity.find(and(workMatch, { type: "stage_change", "meta.to": "lost" }), { leadId: 1 }).lean(),
    // Replies come from the business, so they're counted on the leads in scope, not by user.
    Activity.countDocuments(and({ createdAt: range, type: "email_reply" }, restrictLeads ? onLeads : null)),
    Lead.aggregate([
      { $match: and(leadMatch, { stage: { $nin: ["won", "lost"] } }) },
      { $group: { _id: null, count: { $sum: 1 }, value: { $sum: { $ifNull: ["$dealValue", 0] } } } },
    ]),
    Lead.aggregate([{ $match: and(leadMatch, { createdAt: range }) }, { $group: { _id: "$stage", count: { $sum: 1 } } }]),
    Task.countDocuments(and({ done: true, doneAt: range }, staffId ? { $or: [{ assignedTo: staffId }, { createdBy: staffId }] } : null, searchId ? onLeads : null)),
    Activity.countDocuments(and(workMatch, { type: "whatsapp_unavailable" })),
  ]);

  const wonLeadIds = [...new Set(wonActs.map((a) => String(a.leadId)))];
  const wonLeads = await Lead.find({ _id: { $in: wonLeadIds } }, { dealValue: 1 }).lean();
  const wonValue = wonLeads.reduce((n, l) => n + (l.dealValue ?? 0), 0);
  const lostCount = new Set(lostActs.map((a) => String(a.leadId))).size;
  const contacted = new Set(work.map((a) => String(a.leadId))).size;

  // Over time.
  const series = keys.map((key) => ({ key, newLeads: 0, contacted: new Set(), won: 0, call: 0, email: 0, whatsapp: 0, meeting: 0 }));
  const at = new Map(series.map((s) => [s.key, s]));
  for (const l of newLeads) at.get(keyOf(l.createdAt)) && at.get(keyOf(l.createdAt)).newLeads++;
  for (const a of work) {
    const s = at.get(keyOf(a.createdAt));
    if (!s) continue;
    s[a.type]++;
    s.contacted.add(String(a.leadId));
  }
  for (const a of wonActs) at.get(keyOf(a.createdAt)) && at.get(keyOf(a.createdAt)).won++;

  const outreach = { call: 0, email: 0, whatsapp: 0, meeting: 0 };
  for (const a of work) outreach[a.type]++;

  res.json({
    from,
    to,
    weekly,
    kpis: {
      newLeads: newLeads.length,
      contacted,
      outreach: work.length,
      replies,
      won: wonLeadIds.length,
      wonValue,
      lost: lostCount,
      winRate: wonLeadIds.length + lostCount ? wonLeadIds.length / (wonLeadIds.length + lostCount) : null,
      openLeads: openPipeline[0]?.count ?? 0,
      openValue: openPipeline[0]?.value ?? 0,
      tasksDone,
      // Tried WhatsApp, but the number isn't on it.
      noWhatsapp,
    },
    series: series.map((s) => ({ ...s, contacted: s.contacted.size })),
    outreach,
    funnel: LEAD_STAGES.map((stage) => ({ stage, count: funnel.find((f) => f._id === stage)?.count ?? 0 })),
    team: admin ? await teamReport(range, searchId ? onLeads : null, searchId) : null,
    campaigns: await campaignReport(req.user, searchId),
    emailCampaigns: await emailCampaignReport(req.user, range, staffId),
  });
});

/** Per staff member: what they own and what they did in the period. */
async function teamReport(range, onLeads, searchId) {
  const users = await User.find({ active: true }, { name: 1, role: 1 }).sort({ createdAt: 1 }).lean();
  const ids = users.map((u) => u._id);
  const [owned, acts, won, tasks] = await Promise.all([
    Lead.aggregate([
      { $match: and({ assignedTo: { $in: ids } }, searchId ? { searchIds: searchId } : null) },
      { $group: { _id: "$assignedTo", owned: { $sum: 1 }, open: { $sum: { $cond: [{ $in: ["$stage", ["won", "lost"]] }, 0, 1] } } } },
    ]),
    Activity.aggregate([
      { $match: and({ createdAt: range, userId: { $in: ids }, type: { $in: [...CONTACT, "note", "stage_change", "whatsapp_unavailable"] } }, onLeads) },
      { $group: { _id: { u: "$userId", t: "$type" }, count: { $sum: 1 }, leads: { $addToSet: "$leadId" } } },
    ]),
    Activity.aggregate([
      { $match: and({ createdAt: range, userId: { $in: ids }, type: "stage_change", "meta.to": "won" }, onLeads) },
      { $group: { _id: "$userId", leads: { $addToSet: "$leadId" } } },
      { $lookup: { from: "leads", localField: "leads", foreignField: "_id", as: "l" } },
      { $project: { count: { $size: "$leads" }, value: { $sum: "$l.dealValue" } } },
    ]),
    Task.aggregate([{ $match: { done: true, doneAt: range, assignedTo: { $in: ids } } }, { $group: { _id: "$assignedTo", count: { $sum: 1 } } }]),
  ]);
  return users.map((u) => {
    const id = String(u._id);
    const mine = acts.filter((a) => String(a._id.u) === id);
    const count = (t) => mine.find((a) => a._id.t === t)?.count ?? 0;
    const contacted = new Set(mine.filter((a) => CONTACT.includes(a._id.t)).flatMap((a) => a.leads.map(String))).size;
    const w = won.find((x) => String(x._id) === id);
    const o = owned.find((x) => String(x._id) === id);
    return {
      userId: id,
      name: u.name,
      role: u.role,
      owned: o?.owned ?? 0,
      open: o?.open ?? 0,
      contacted,
      calls: count("call"),
      emails: count("email"),
      whatsapp: count("whatsapp"),
      noWhatsapp: count("whatsapp_unavailable"),
      meetings: count("meeting"),
      notes: count("note"),
      stageMoves: count("stage_change"),
      won: w?.count ?? 0,
      wonValue: w?.value ?? 0,
      tasksDone: tasks.find((t) => String(t._id) === id)?.count ?? 0,
    };
  });
}

/** Per campaign (search), all time: how far its leads have got. */
async function campaignReport(user, searchId) {
  const searches = await Search.find(and(searchScope(user), searchId ? { _id: searchId } : null), { name: 1, leadsFound: 1, createdAt: 1 })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  if (!searches.length) return [];
  const ids = searches.map((s) => s._id);
  const stats = await Lead.aggregate([
    { $match: and(scoped(user), { searchIds: { $in: ids } }) },
    { $unwind: "$searchIds" },
    { $match: { searchIds: { $in: ids } } },
    {
      $group: {
        _id: "$searchIds",
        leads: { $sum: 1 },
        withPhone: { $sum: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$phone", ""] } }, 0] }, 1, 0] } },
        withEmail: { $sum: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$email", ""] } }, 0] }, 1, 0] } },
        contacted: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$lastContactedAt", null] }, null] }, 1, 0] } },
        progressed: { $sum: { $cond: [{ $in: ["$stage", ["qualified", "proposal", "won"]] }, 1, 0] } },
        won: { $sum: { $cond: [{ $eq: ["$stage", "won"] }, 1, 0] } },
        wonValue: { $sum: { $cond: [{ $eq: ["$stage", "won"] }, { $ifNull: ["$dealValue", 0] }, 0] } },
        opportunity: { $avg: "$opportunity" },
      },
    },
  ]);
  return searches.map((s) => {
    const x = stats.find((r) => String(r._id) === String(s._id)) ?? {};
    return {
      searchId: String(s._id),
      name: s.name,
      createdAt: s.createdAt,
      leads: x.leads ?? 0,
      withPhone: x.withPhone ?? 0,
      withEmail: x.withEmail ?? 0,
      contacted: x.contacted ?? 0,
      progressed: x.progressed ?? 0,
      won: x.won ?? 0,
      wonValue: x.wonValue ?? 0,
      avgOpportunity: x.opportunity != null ? Math.round(x.opportunity) : null,
    };
  });
}

/** Email campaigns active in the period. */
async function emailCampaignReport(user, range, staffId) {
  const filter = and(
    { startedAt: { $ne: null } },
    { $or: [{ startedAt: range }, { completedAt: range }, { status: { $in: ["sending", "paused"] } }] },
    !isAdmin(user) ? { createdBy: user._id } : staffId ? { createdBy: staffId } : null,
  );
  const list = await Campaign.find(filter, { name: 1, status: 1, sent: 1, followUpsSent: 1, replied: 1, bounced: 1, unsubscribed: 1, failed: 1, startedAt: 1 })
    .sort({ startedAt: -1 })
    .limit(50)
    .lean();
  return list.map((c) => ({ ...c, id: String(c._id), _id: undefined }));
}
