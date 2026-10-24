import { Router } from "express";
import mongoose from "mongoose";
import { Activity } from "../models/Activity.js";
import { Import } from "../models/Import.js";
import { LEAD_PRIORITIES, LEAD_STAGES, Lead, dedupeKeyFor, refreshKeys, refreshScores } from "../models/Lead.js";
import { MATCH_KEYS, keysFor } from "../models/leadKeys.js";
import { deleteLeads } from "../services/crm.js";
import { DEFAULT_MATCH_ON, existingMatcher, fileMatcher, matchLabel } from "../services/dedupe.js";
import { grantAccess, isAdmin, requirePermission, visibleLeadIds } from "../services/access.js";

const canImport = requirePermission("import", "Importing leads is turned off for your account.");

export const importsRouter = Router();

const MAX_ROWS = 20000;
const TEXT_FIELDS = ["businessName", "category", "country", "city", "address", "phone", "email", "website", "contactName", "contactRole", "sourceUrl", "notes"];
/** Fields an import may fill in on an existing lead (only when the lead has none). */
const FILLABLE = ["category", "country", "city", "address", "phone", "email", "website", "contactName", "contactRole", "sourceUrl"];

const str = (v, max = 500) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function parseTags(v) {
  const list = Array.isArray(v) ? v : String(v ?? "").split(/[,;|]/);
  return [...new Set(list.map((t) => str(t, 40)).filter(Boolean))].slice(0, 30);
}

function parseStage(v) {
  const s = str(v).toLowerCase();
  return LEAD_STAGES.find((x) => x === s || s.startsWith(x)) ?? null;
}

function parseMoney(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Normalises one mapped row from the browser. */
function cleanRow(raw, defaults) {
  const row = {};
  for (const f of TEXT_FIELDS) row[f] = str(raw?.[f], f === "notes" ? 5000 : 500);
  row.email = row.email.toLowerCase().replace(/^mailto:/, "");
  if (row.website && !/^https?:\/\//i.test(row.website)) row.website = `https://${row.website}`;
  row.tags = [...new Set([...parseTags(raw?.tags), ...defaults.tags])];
  row.stage = parseStage(raw?.stage) ?? defaults.stage;
  const priority = str(raw?.priority).toLowerCase();
  row.priority = LEAD_PRIORITIES.includes(priority) ? priority : "medium";
  row.dealValue = parseMoney(raw?.dealValue);
  if (!row.country) row.country = defaults.country;
  if (!row.category) row.category = defaults.category;
  return row;
}

function cleanOptions(o = {}) {
  const matchOn = Array.isArray(o.matchOn) ? o.matchOn.filter((k) => DEFAULT_MATCH_ON.includes(k)) : DEFAULT_MATCH_ON;
  return {
    matchOn: MATCH_KEYS.map((k) => k.key).filter((k) => matchOn.includes(k)),
    // "skip": leave existing leads alone. "fill": add details they're missing. Never duplicates.
    duplicateMode: o.duplicateMode === "fill" ? "fill" : "skip",
    defaults: {
      country: str(o.defaults?.country, 100),
      category: str(o.defaults?.category, 100),
      stage: LEAD_STAGES.includes(o.defaults?.stage) ? o.defaults.stage : "new",
      tags: parseTags(o.defaults?.tags),
    },
  };
}

/**
 * Classifies every row: "new", "existing" (already in the database), "in_file" (repeats an
 * earlier row, whose empty fields it fills) or "invalid".
 */
async function analyze(rawRows, options, user = null) {
  const rows = rawRows.slice(0, MAX_ROWS).map((r) => cleanRow(r, options.defaults));
  const keys = rows.map((r) => keysFor(r));
  const dedupeKeys = rows.map((r) => (r.businessName ? dedupeKeyFor(r.businessName, r.city) : null));
  const findExisting = await existingMatcher(keys, options.matchOn);
  // Exact name|city is always checked: the database allows only one lead per pair.
  const takenKeys = new Map(
    (await Lead.find({ dedupeKey: { $in: dedupeKeys.filter(Boolean) } }, { businessName: 1, city: 1, stage: 1, dedupeKey: 1 })).map((l) => [l.dedupeKey, l]),
  );
  const file = fileMatcher(options.matchOn);
  const fileDedupe = new Map();

  const results = rows.map((row, i) => {
    if (!row.businessName) return { index: i, status: "invalid", reason: "Missing business name" };
    const inFile = file.find(keys[i]) ?? (fileDedupe.has(dedupeKeys[i]) ? { row: fileDedupe.get(dedupeKeys[i]), by: "nameKey" } : null);
    if (inFile) {
      // Fold this row into the first one so no information is lost.
      const first = rows[inFile.row];
      for (const f of [...FILLABLE, "notes"]) if (!first[f] && row[f]) first[f] = row[f];
      first.tags = [...new Set([...first.tags, ...row.tags])];
      if (first.dealValue == null) first.dealValue = row.dealValue;
      return { index: i, status: "in_file", by: inFile.by, ofRow: inFile.row };
    }
    file.add(keys[i], i);
    fileDedupe.set(dedupeKeys[i], i);
    const hit = findExisting(keys[i]) ?? (takenKeys.has(dedupeKeys[i]) ? { lead: takenKeys.get(dedupeKeys[i]), by: "nameKey" } : null);
    if (hit) return { index: i, status: "existing", by: hit.by, lead: hit.lead };
    return { index: i, status: "new" };
  });

  // Details an existing lead would gain in "fill" mode (computed after rows were folded).
  const fullLeads = new Map(
    (await Lead.find({ _id: { $in: results.filter((r) => r.lead).map((r) => r.lead._id) } })).map((l) => [String(l._id), l]),
  );
  const visible = user && !isAdmin(user) ? new Set((await visibleLeadIds(user)).map(String)) : null;
  for (const r of results) {
    if (r.status !== "existing") continue;
    r.hidden = visible ? !visible.has(String(r.lead._id)) : false;
    if (r.hidden) {
      r.fills = [];
      r.newTags = [];
      continue;
    }
    const lead = fullLeads.get(String(r.lead._id));
    r.fills = lead ? FILLABLE.filter((f) => !lead[f] && rows[r.index][f]) : [];
    r.newTags = lead ? rows[r.index].tags.filter((t) => !lead.tags.includes(t)) : [];
  }
  return { rows, results, fullLeads };
}

function summarize(rows, results) {
  const count = (s) => results.filter((r) => r.status === s).length;
  return {
    totalRows: rows.length,
    counts: {
      new: count("new"),
      existing: count("existing"),
      inFile: count("in_file"),
      invalid: count("invalid"),
      fillable: results.filter((r) => r.status === "existing" && (r.fills.length || r.newTags.length)).length,
    },
    rows: results.map((r) => ({
      index: r.index,
      status: r.status,
      by: r.by ? matchLabel(r.by) : null,
      reason: r.reason ?? null,
      ofRow: r.ofRow ?? null,
      fills: r.fills ?? [],
      existing: r.lead
        ? r.hidden
          ? { id: null, businessName: "a lead another team member is working on", city: "", stage: null }
          : { id: String(r.lead._id), businessName: r.lead.businessName, city: r.lead.city, stage: r.lead.stage }
        : null,
    })),
  };
}

function readBody(req) {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!rows?.length) return { error: "The file has no rows to import." };
  if (rows.length > MAX_ROWS) return { error: `Import at most ${MAX_ROWS.toLocaleString()} rows at a time. Split the file and try again.` };
  return { rows, options: cleanOptions(req.body.options) };
}

importsRouter.get("/", async (req, res) => {
  res.json(await Import.find(isAdmin(req.user) ? {} : { userId: req.user._id }).sort({ createdAt: -1 }).limit(100));
});

// Dry run: what would happen, without changing anything.
importsRouter.post("/analyze", canImport, async (req, res) => {
  const { rows, options, error } = readBody(req);
  if (error) return res.status(400).json({ error });
  const { rows: cleaned, results } = await analyze(rows, options, req.user);
  res.json(summarize(cleaned, results));
});

importsRouter.post("/", canImport, async (req, res) => {
  const { rows, options, error } = readBody(req);
  if (error) return res.status(400).json({ error });
  const filename = str(req.body?.filename, 200) || "import";
  // Re-run the analysis here; never trust a client-side classification.
  const { rows: cleaned, results, fullLeads } = await analyze(rows, options, req.user);
  const record = await Import.create({ filename, by: req.user.name, userId: req.user._id, totalRows: cleaned.length, options });
  const by = req.user.name;

  // New leads.
  const fresh = results.filter((r) => r.status === "new").map((r) => cleaned[r.index]);
  const inserted = fresh.length
    ? await Lead.insertMany(
        fresh.map(({ notes: _notes, ...row }) => ({
          ...row,
          ...keysFor(row),
          address: row.address || null,
          phone: row.phone || null,
          email: row.email || null,
          website: row.website || null,
          sourceUrl: row.sourceUrl || null,
          contactName: row.contactName || null,
          contactRole: row.contactRole || null,
          source: `Import: ${filename}`,
          importId: record._id,
          // A member's imported leads are theirs to work.
          assignedTo: isAdmin(req.user) ? null : req.user._id,
          dedupeKey: dedupeKeyFor(row.businessName, row.city),
          stageChangedAt: row.stage !== "new" ? new Date() : null,
        })),
      )
    : [];
  const notes = inserted
    .map((lead, i) => ({ lead, text: fresh[i].notes }))
    .filter((n) => n.text)
    .map((n) => ({ leadId: n.lead._id, type: "note", text: n.text, by }));
  if (notes.length) await Activity.insertMany(notes);

  // Existing leads: only ever add what's missing.
  let updated = 0;
  if (options.duplicateMode === "fill") {
    for (const r of results.filter((x) => x.status === "existing" && (x.fills.length || x.newTags.length))) {
      const lead = fullLeads.get(String(r.lead._id));
      const row = cleaned[r.index];
      const set = Object.fromEntries(r.fills.map((f) => [f, row[f]]));
      if (lead.dealValue == null && row.dealValue != null) set.dealValue = row.dealValue;
      await Lead.updateOne({ _id: lead._id }, { $set: set, $addToSet: { tags: { $each: r.newTags } } });
      const added = [...r.fills, ...(r.newTags.length ? ["tags"] : [])];
      await Activity.create({ leadId: lead._id, type: "note", text: `Updated from import “${filename}”: added ${added.join(", ")}.${row.notes ? `\n\n${row.notes}` : ""}`, by });
      updated++;
    }
    const ids = results.filter((r) => r.status === "existing").map((r) => r.lead._id);
    await Promise.all([refreshKeys({ _id: { $in: ids } }), refreshScores({ _id: { $in: ids } })]);
  }
  await refreshScores({ importId: record._id });
  await grantAccess(req.user, { importId: record._id });

  record.set({
    created: inserted.length,
    updated,
    skippedExisting: results.filter((r) => r.status === "existing").length - updated,
    duplicatesInFile: results.filter((r) => r.status === "in_file").length,
    invalid: results.filter((r) => r.status === "invalid").length,
  });
  await record.save();
  res.status(201).json(record);
});

// Undo: removes leads this import created that nobody has started working on yet.
importsRouter.delete("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
  const record = await Import.findById(req.params.id);
  if (!record) return res.status(404).json({ error: "Import not found" });
  // Undo deletes leads, and only admins may delete leads.
  if (req.user.role !== "admin") return res.status(403).json({ error: "Only an admin can undo an import." });
  const deleted = await deleteLeads({ importId: record._id, stage: "new" });
  const kept = await Lead.countDocuments({ importId: record._id });
  record.undoneAt = new Date();
  await record.save();
  res.json({ deleted, kept });
});
