import { Router } from "express";
import { LEAD_STAGES, Lead } from "../models/Lead.js";
import { Search } from "../models/Search.js";
import { Task } from "../models/Task.js";
import { isAdmin, scoped, searchScope, visibleLeadIds } from "../services/access.js";

export const statsRouter = Router();

const DAYS = 14;
const hasValue = (field) => ({ [field]: { $nin: [null, ""] } });

statsRouter.get("/", async (req, res) => {
  // The browser sends its UTC offset so days are bucketed in the user's local time.
  const tzOffsetMinutes = Number(req.query.tzOffset) || 0;
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (DAYS - 1));

  const dayExpr = {
    $dateToString: {
      format: "%Y-%m-%d",
      date: { $subtract: ["$createdAt", tzOffsetMinutes * 60 * 1000] },
    },
  };
  // Members see numbers for their own leads, searches and tasks only.
  const leadScope = scoped(req.user);
  const searchesOf = searchScope(req.user);
  const taskScope = isAdmin(req.user)
    ? {}
    : { $or: [{ assignedTo: req.user._id }, { createdBy: req.user._id }, { leadId: { $in: await visibleLeadIds(req.user) } }] };
  const scopeOf = (Model) => (Model === Lead ? leadScope : searchesOf);
  const perDay = (Model) =>
    Model.aggregate([
      { $match: { $and: [scopeOf(Model), { createdAt: { $gte: new Date(since.getTime() - 86400000) } }] } },
      { $group: { _id: dayExpr, count: { $sum: 1 } } },
    ]);

  // End of the user's local day, as a UTC instant.
  const endOfToday = new Date(Date.now() - tzOffsetMinutes * 60000);
  endOfToday.setUTCHours(24, 0, 0, 0);
  endOfToday.setTime(endOfToday.getTime() + tzOffsetMinutes * 60000);

  const [totalLeads, withPhone, withEmail, withWebsite, statusCounts, leadDays, searchDays, topCountries, stages, overdue, dueToday, openTasks] =
    await Promise.all([
      Lead.countDocuments(leadScope),
      Lead.countDocuments(scoped(req.user, hasValue("phone"))),
      Lead.countDocuments(scoped(req.user, hasValue("email"))),
      Lead.countDocuments(scoped(req.user, hasValue("website"))),
      Search.aggregate([{ $match: searchesOf }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      perDay(Lead),
      perDay(Search),
      Lead.aggregate([
        { $match: leadScope },
        { $group: { _id: "$country", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
      Lead.aggregate([
        { $match: leadScope },
        { $group: { _id: "$stage", count: { $sum: 1 }, value: { $sum: { $ifNull: ["$dealValue", 0] } } } },
      ]),
      Task.countDocuments({ $and: [taskScope, { done: false, dueAt: { $lt: new Date() } }] }),
      Task.countDocuments({ $and: [taskScope, { done: false, dueAt: { $gte: new Date(), $lt: endOfToday } }] }),
      Task.countDocuments({ $and: [taskScope, { done: false }] }),
    ]);

  const leadMap = Object.fromEntries(leadDays.map((d) => [d._id, d.count]));
  const searchMap = Object.fromEntries(searchDays.map((d) => [d._id, d.count]));
  const activity = Array.from({ length: DAYS }, (_, i) => {
    const local = new Date(Date.now() - tzOffsetMinutes * 60000);
    local.setUTCDate(local.getUTCDate() - (DAYS - 1 - i));
    const key = local.toISOString().slice(0, 10);
    return { day: key, leads: leadMap[key] ?? 0, searches: searchMap[key] ?? 0 };
  });

  const searches = Object.fromEntries(statusCounts.map((s) => [s._id, s.count]));
  res.json({
    totalLeads,
    withPhone,
    withEmail,
    withWebsite,
    searches: {
      total: statusCounts.reduce((n, s) => n + s.count, 0),
      completed: searches.completed ?? 0,
      running: (searches.running ?? 0) + (searches.paused ?? 0),
      failed: searches.failed ?? 0,
      cancelled: searches.cancelled ?? 0,
    },
    activity,
    topCountries: topCountries.map((c) => ({ country: c._id || "Unknown", count: c.count })),
    pipeline: LEAD_STAGES.map((stage) => {
      const s = stages.find((x) => x._id === stage);
      return { stage, count: s?.count ?? 0, value: s?.value ?? 0 };
    }),
    tasks: { overdue, dueToday, open: openTasks },
  });
});
