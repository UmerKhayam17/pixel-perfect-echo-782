import { Router } from "express";
import { requireAdmin } from "../middleware/auth.js";
import { LEAD_SOURCES, getSettings } from "../models/Settings.js";
import { encryptSecret } from "../services/security.js";

export const settingsRouter = Router();

const EDITABLE = [
  "profileName",
  "profileEmail",
  "defaultCountry",
  "defaultResultLimit",
  "rowsPerPage",
  "compactTable",
  "currency",
  "defaultWhatsappTemplateId",
  "whatsappStaffMustUseFormat",
  "defaultPhone",
  "defaultEmail",
  "defaultWebsite",
  "defaultOnlyWithWebsites",
  "defaultWebsiteFilter",
  "leadSource",
];

settingsRouter.get("/", async (_req, res) => {
  res.json(await getSettings());
});

settingsRouter.put("/", requireAdmin, async (req, res) => {
  const settings = await getSettings();
  const body = req.body ?? {};
  for (const key of EDITABLE) {
    if (key in body) settings.set(key, body[key]);
  }
  if (body.leadSource && !LEAD_SOURCES.includes(body.leadSource)) {
    return res.status(400).json({ error: `leadSource must be one of ${LEAD_SOURCES.join(", ")}` });
  }
  // null/"" clears the stored key; a string sets it; absent leaves it unchanged.
  if ("googlePlacesApiKey" in body) settings.googlePlacesApiKey = encryptSecret(String(body.googlePlacesApiKey ?? "").trim());

  try {
    await settings.save();
  } catch (err) {
    if (err.name === "ValidationError") return res.status(400).json({ error: err.message });
    throw err;
  }
  res.json(settings);
});
