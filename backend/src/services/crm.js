import { Activity, CONTACT_ACTIVITIES } from "../models/Activity.js";
import { Lead } from "../models/Lead.js";
import { Task } from "../models/Task.js";

/**
 * Moves leads to `stage`, logging a stage_change activity on each one that actually moved.
 * `where` narrows which leads may move (e.g. only those still "new"). Returns how many moved.
 */
export async function setStage(ids, stage, where = {}, by = null, userId = null) {
  const leads = await Lead.find({ $and: [where, { _id: { $in: ids }, stage: { $ne: stage } }] }, { stage: 1 });
  if (!leads.length) return 0;
  await Lead.updateMany({ _id: { $in: leads.map((l) => l._id) } }, { $set: { stage, stageChangedAt: new Date() } });
  await Activity.insertMany(
    leads.map((l) => ({ leadId: l._id, type: "stage_change", meta: { from: l.stage, to: stage }, by, userId })),
  );
  return leads.length;
}

/** Adds a timeline entry. Reaching out (call/email/meeting) marks the lead contacted. `by` names who did it. */
export async function logActivity(leadId, type, text = "", by = null, userId = null) {
  const activity = await Activity.create({ leadId, type, text, by, userId });
  if (CONTACT_ACTIVITIES.includes(type)) {
    await Lead.updateOne({ _id: leadId }, { $set: { lastContactedAt: activity.createdAt } });
    await setStage([leadId], "contacted", { stage: "new" }, by, userId);
  }
  return activity;
}

/** Deletes leads matching `filter` together with their activities and tasks. */
export async function deleteLeads(filter) {
  const ids = (await Lead.find(filter, { _id: 1 })).map((l) => l._id);
  if (!ids.length) return 0;
  const result = await Lead.deleteMany({ _id: { $in: ids } });
  await Promise.all([Activity.deleteMany({ leadId: { $in: ids } }), Task.deleteMany({ leadId: { $in: ids } })]);
  return result.deletedCount;
}
