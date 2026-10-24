import * as XLSX from "xlsx";
import type { Lead } from "@/types";

export interface LeadField {
  key: string;
  label: string;
  get: (lead: Lead) => string;
}

export const LEAD_FIELDS: LeadField[] = [
  { key: "businessName", label: "Business Name", get: (l) => l.businessName },
  { key: "category", label: "Category", get: (l) => l.category },
  { key: "country", label: "Country", get: (l) => l.country },
  { key: "city", label: "City", get: (l) => l.city },
  { key: "address", label: "Address", get: (l) => l.address ?? "" },
  { key: "phone", label: "Phone Number", get: (l) => l.phone ?? "" },
  { key: "email", label: "Email Address", get: (l) => l.email ?? "" },
  { key: "website", label: "Website", get: (l) => l.website ?? "" },
  { key: "googleProfile", label: "Google Business Profile", get: (l) => l.sourceUrl ?? "" },
  { key: "contactName", label: "Contact Person", get: (l) => l.contactName ?? "" },
  { key: "stage", label: "Stage", get: (l) => l.stage },
  { key: "priority", label: "Priority", get: (l) => l.priority },
  { key: "dealValue", label: "Deal Value", get: (l) => (l.dealValue != null ? String(l.dealValue) : "") },
  { key: "tags", label: "Tags", get: (l) => l.tags.join(", ") },
  { key: "score", label: "Lead Score", get: (l) => String(l.score) },
  { key: "lastContactedAt", label: "Last Contacted", get: (l) => l.lastContactedAt?.slice(0, 10) ?? "" },
  { key: "opportunity", label: "Opportunity Score", get: (l) => String(l.opportunity ?? "") },
  { key: "opportunityReasons", label: "Opportunity Reasons", get: (l) => (l.opportunityReasons ?? []).join("; ") },
  { key: "rating", label: "Google Rating", get: (l) => (l.rating != null ? String(l.rating) : "") },
  { key: "reviewCount", label: "Google Reviews", get: (l) => (l.reviewCount != null ? String(l.reviewCount) : "") },
  { key: "facebook", label: "Facebook", get: (l) => l.socials?.facebook ?? "" },
  { key: "instagram", label: "Instagram", get: (l) => l.socials?.instagram ?? "" },
  { key: "linkedin", label: "LinkedIn", get: (l) => l.socials?.linkedin ?? "" },
  { key: "source", label: "Data Source", get: (l) => l.source },
  { key: "dateAdded", label: "Date Added", get: (l) => l.dateAdded.slice(0, 10) },
];

export const DEFAULT_EXPORT_FIELD_KEYS = ["businessName", "category", "country", "city", "address", "phone", "email", "website", "googleProfile", "dateAdded"];

function buildRows(leads: Lead[], fieldKeys: string[]): Record<string, string>[] {
  const fields = LEAD_FIELDS.filter((f) => fieldKeys.includes(f.key));
  return leads.map((lead) => {
    const row: Record<string, string> = {};
    for (const f of fields) row[f.label] = f.get(lead);
    return row;
  });
}

function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCSV(leads: Lead[], fieldKeys: string[], filename: string) {
  const rows = buildRows(leads, fieldKeys);
  const headers = Object.keys(rows[0] ?? {});
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) lines.push(headers.map((h) => escape(row[h] ?? "")).join(","));
  triggerDownload(filename, new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
}

export function downloadExcel(leads: Lead[], fieldKeys: string[], filename: string) {
  const rows = buildRows(leads, fieldKeys);
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Leads");
  const out = XLSX.write(book, { bookType: "xlsx", type: "array" });
  triggerDownload(filename, new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}
