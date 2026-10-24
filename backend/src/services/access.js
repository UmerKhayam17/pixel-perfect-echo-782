import mongoose from "mongoose";
import { Lead } from "../models/Lead.js";

/**
 * Who can see which leads.
 *
 * Admins see everything. A member sees only leads that are
 *   - from a search or import an admin assigned to them (user.access.searchIds / importIds),
 *   - assigned to them personally (lead.assignedTo), or
 *   - created by them (leads they add and imports they make).
 *
 * Every route that reads or changes leads combines its own filter with leadScope(req.user).
 */

// Running searches (finding new leads) is admin-only and not a member permission.
// Deleting leads is not a permission: it is always admin-only.
export const PERMISSIONS = ["import", "export", "campaigns"];
/** What a new member may do until an admin changes it. Export and delete are off: data stays put. */
export const DEFAULT_PERMISSIONS = { import: true, export: false, campaigns: true };

export const isAdmin = (user) => user?.role === "admin";

export function can(user, permission) {
  if (isAdmin(user)) return true;
  return Boolean({ ...DEFAULT_PERMISSIONS, ...(user?.permissions?.toObject?.() ?? user?.permissions ?? {}) }[permission]);
}

/** Express guard: 403 unless the user is an admin or has the permission. */
export const requirePermission = (permission, message) => (req, res, next) =>
  can(req.user, permission)
    ? next()
    : res.status(403).json({ error: message ?? "You don't have permission to do this. Ask an admin.", code: "forbidden" });

/** Mongo filter limiting leads to what `user` may see ({} for admins). */
export function leadScope(user) {
  if (!user || isAdmin(user)) return {};
  const or = [{ assignedTo: user._id }];
  const searchIds = user.access?.searchIds ?? [];
  const importIds = user.access?.importIds ?? [];
  if (searchIds.length) or.push({ searchIds: { $in: searchIds } });
  if (importIds.length) or.push({ importId: { $in: importIds } });
  const leadIds = user.access?.leadIds ?? [];
  if (leadIds.length) or.push({ _id: { $in: leadIds } });
  return { $or: or };
}

/** `filter` restricted to the user's leads. */
export function scoped(user, filter = {}) {
  const scope = leadScope(user);
  if (!Object.keys(scope).length) return filter;
  if (!Object.keys(filter).length) return scope;
  return { $and: [scope, filter] };
}

/** Ids of every lead the user may see (null = no restriction). */
export async function visibleLeadIds(user) {
  if (isAdmin(user)) return null;
  return Lead.distinct("_id", leadScope(user));
}

export async function canSeeLead(user, leadId) {
  if (!mongoose.isValidObjectId(leadId)) return false;
  return Boolean(await Lead.exists(scoped(user, { _id: leadId })));
}

/** Gives a member access to a search they started or an import they made. */
export async function grantAccess(user, { searchId, importId }) {
  if (!user || isAdmin(user)) return;
  const { User } = await import("../models/User.js");
  const update = {};
  if (searchId) update["access.searchIds"] = searchId;
  if (importId) update["access.importIds"] = importId;
  await User.updateOne({ _id: user._id }, { $addToSet: update });
}

/** Searches a member may see: assigned to them or started by them. */
export function searchScope(user) {
  if (isAdmin(user)) return {};
  return { $or: [{ _id: { $in: user.access?.searchIds ?? [] } }, { createdBy: user._id }] };
}
