import { Search } from "../models/Search.js";
import { getSettings } from "../models/Settings.js";
import { Template } from "../models/Template.js";
import { isAdmin } from "./access.js";

/**
 * The WhatsApp message an admin chose for each lead: the template of the newest search (campaign)
 * the lead came from that has one, otherwise the workspace default.
 *
 * Returns { formats: Map<leadId, { template, source }>, mustUse } where mustUse says whether this
 * user has to send exactly that message (members, when "staff must use the admin's message" is on).
 */
export async function whatsappFormats(leads, user) {
  const settings = await getSettings();
  const searchIds = [...new Set(leads.flatMap((l) => (l.searchIds ?? []).map(String)))];
  const searches = searchIds.length
    ? await Search.find({ _id: { $in: searchIds }, whatsappTemplateId: { $ne: null } }, { name: 1, whatsappTemplateId: 1, createdAt: 1 }).sort({ createdAt: -1 })
    : [];
  const templateIds = [...new Set([...searches.map((s) => String(s.whatsappTemplateId)), settings.defaultWhatsappTemplateId].filter(Boolean))];
  const templates = new Map(
    (await Template.find({ _id: { $in: templateIds }, channel: "whatsapp" })).map((t) => [String(t._id), t]),
  );
  const fallback = settings.defaultWhatsappTemplateId ? templates.get(String(settings.defaultWhatsappTemplateId)) : null;

  const formats = new Map();
  for (const lead of leads) {
    const own = new Set((lead.searchIds ?? []).map(String));
    // Searches are sorted newest first, so the first match is the most recent campaign.
    const search = searches.find((s) => own.has(String(s._id)) && templates.has(String(s.whatsappTemplateId)));
    if (search) formats.set(String(lead._id), { template: templates.get(String(search.whatsappTemplateId)), source: search.name });
    else if (fallback) formats.set(String(lead._id), { template: fallback, source: "Default message" });
    else formats.set(String(lead._id), { template: null, source: null });
  }
  return { formats, mustUse: !isAdmin(user) && settings.whatsappStaffMustUseFormat !== false };
}

export const templateSummary = (t) => (t ? { id: String(t._id), name: t.name, body: t.body } : null);
