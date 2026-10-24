import { api } from "@/lib/api";
import { LEAD_FIELDS, downloadCSV, downloadExcel } from "@/utils/exporters";
import type { ExportFormat, ExportRecord, LeadQuery } from "@/types";

export function exportFilename(scope: string, format: ExportFormat): string {
  const slug = scope
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${slug || "leads"}-${new Date().toISOString().slice(0, 10)}.${format}`;
}

/**
 * Fetches every lead matching `query` (or the given ids), downloads the file in the
 * browser and records it in the export history. Returns the stored record.
 */
export async function exportLeads(opts: {
  query: LeadQuery;
  ids?: string[] | undefined;
  format: ExportFormat;
  fieldKeys: string[];
  scope: string;
  filename?: string | undefined;
}): Promise<ExportRecord> {
  const { items } = await api.allLeads(opts.query);
  const leads = opts.ids ? items.filter((l) => opts.ids!.includes(l.id)) : items;
  if (leads.length === 0) throw new Error("There are no leads to export for this selection.");

  const filename = opts.filename?.trim() || exportFilename(opts.scope, opts.format);
  if (opts.format === "csv") downloadCSV(leads, opts.fieldKeys, filename);
  else downloadExcel(leads, opts.fieldKeys, filename);

  return api.recordExport({
    filename,
    format: opts.format,
    scope: opts.scope,
    fields: LEAD_FIELDS.filter((f) => opts.fieldKeys.includes(f.key)).map((f) => f.label),
    count: leads.length,
    status: "completed",
  });
}
