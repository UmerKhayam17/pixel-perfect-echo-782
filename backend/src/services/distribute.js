import { Activity } from "../models/Activity.js";
import { Lead } from "../models/Lead.js";
import { Search } from "../models/Search.js";
import { User } from "../models/User.js";
import { notify } from "./notify.js";

/**
 * Splits leads between staff.
 *   even     — take turns, after sorting by opportunity, so everyone gets a fair share of the best leads.
 *   balanced — each lead goes to whoever currently has the fewest open (not won/lost) leads.
 * Returns the plan: [{ userId, name, leadIds }].
 */
export async function planDistribution(leads, users, method = "even") {
  const sorted = [...leads].sort((a, b) => (b.opportunity ?? 0) - (a.opportunity ?? 0) || (b.reviewCount ?? 0) - (a.reviewCount ?? 0));
  const plan = users.map((u) => ({ userId: String(u._id), name: u.name, leadIds: [] }));
  if (!plan.length) return plan;

  if (method === "balanced") {
    const open = await Lead.aggregate([
      { $match: { assignedTo: { $in: users.map((u) => u._id) }, stage: { $nin: ["won", "lost"] } } },
      { $group: { _id: "$assignedTo", count: { $sum: 1 } } },
    ]);
    const load = new Map(plan.map((p) => [p.userId, 0]));
    for (const o of open) load.set(String(o._id), o.count);
    for (const lead of sorted) {
      const next = plan.reduce((best, p) => (load.get(p.userId) < load.get(best.userId) ? p : best), plan[0]);
      next.leadIds.push(String(lead._id));
      load.set(next.userId, load.get(next.userId) + 1);
    }
  } else {
    sorted.forEach((lead, i) => plan[i % plan.length].leadIds.push(String(lead._id)));
  }
  return plan;
}

/** Applies a plan: assigns the leads, notes it on each timeline and notifies each person once. */
export async function applyDistribution(plan, { by, byUserId, label }) {
  for (const p of plan) {
    if (!p.leadIds.length) continue;
    await Lead.updateMany({ _id: { $in: p.leadIds } }, { assignedTo: p.userId });
    await Activity.insertMany(
      p.leadIds.map((leadId) => ({ leadId, type: "note", text: `Assigned to ${p.name}${label ? ` (${label})` : ""}`, by, userId: byUserId })),
    );
    await notify(p.userId, {
      type: "leads_assigned",
      title: `${p.leadIds.length} new lead${p.leadIds.length === 1 ? "" : "s"} assigned to you`,
      body: label ? `From ${label}${by ? ` · by ${by}` : ""}` : by ? `By ${by}` : "",
      link: "/leads?assignedTo=me",
    });
  }
  return plan.map(({ userId, name, leadIds }) => ({ userId, name, count: leadIds.length }));
}

/** Active staff (any role) from a list of ids, in the given order. */
export async function activeUsers(ids) {
  const users = await User.find({ _id: { $in: ids }, active: true }, { name: 1 });
  return ids.map((id) => users.find((u) => String(u._id) === String(id))).filter(Boolean);
}

/**
 * For a search set to auto-assign: the next person in its rotation for a newly found lead.
 * The rotation counter lives on the search, so it keeps going across restarts and re-runs.
 */
export async function nextAutoAssignee(searchId) {
  const search = await Search.findOneAndUpdate(
    { _id: searchId, "autoDistribute.userIds.0": { $exists: true } },
    { $inc: { "autoDistribute.cursor": 1 } },
    { new: false, projection: { autoDistribute: 1 } },
  );
  if (!search) return null;
  const ids = search.autoDistribute.userIds;
  return ids[(search.autoDistribute.cursor ?? 0) % ids.length];
}
