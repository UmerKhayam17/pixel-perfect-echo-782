import { Router } from "express";
import { LEAD_STAGES, Lead } from "../models/Lead.js";
import { Task } from "../models/Task.js";
import { scoped } from "../services/access.js";
import { leadFilter } from "./leads.js";

export const pipelineRouter = Router();

/** Kanban board: per stage, the lead count, total deal value and the most recently moved leads. */
pipelineRouter.get("/", async (req, res) => {
  const { stage: _ignored, ...query } = req.query;
  if (query.assignedTo === "me") query.assignedTo = String(req.user._id);
  const filter = scoped(req.user, leadFilter(query));
  const perStage = Math.min(Math.max(Number(req.query.perStage) || 50, 1), 200);

  const [totals, ...columns] = await Promise.all([
    Lead.aggregate([
      { $match: filter },
      { $group: { _id: "$stage", count: { $sum: 1 }, value: { $sum: { $ifNull: ["$dealValue", 0] } } } },
    ]),
    ...LEAD_STAGES.map((stage) =>
      Lead.find({ ...filter, stage }).sort({ pinned: -1, stageChangedAt: -1, score: -1, createdAt: -1 }).limit(perStage),
    ),
  ]);

  // The next open task on each card.
  const ids = columns.flat().map((l) => l._id);
  const next = await Task.aggregate([
    { $match: { leadId: { $in: ids }, done: false, dueAt: { $ne: null } } },
    { $sort: { dueAt: 1 } },
    { $group: { _id: "$leadId", title: { $first: "$title" }, dueAt: { $first: "$dueAt" } } },
  ]);
  const nextByLead = new Map(next.map((t) => [String(t._id), { title: t.title, dueAt: t.dueAt }]));

  const byStage = Object.fromEntries(totals.map((t) => [t._id, t]));
  res.json(
    LEAD_STAGES.map((stage, i) => ({
      stage,
      count: byStage[stage]?.count ?? 0,
      value: byStage[stage]?.value ?? 0,
      leads: columns[i].map((l) => ({ ...l.toJSON(), nextTask: nextByLead.get(String(l._id)) ?? null })),
    })),
  );
});
