import * as XLSX from "xlsx";
import type { ImportField, ImportRow } from "@/types";

export interface ImportFieldDef {
  key: ImportField;
  label: string;
  /** Header names (normalised: lowercase letters/digits only) that map here automatically. */
  aliases: string[];
  required?: boolean;
}

export const IMPORT_FIELDS: ImportFieldDef[] = [
  {
    key: "businessName",
    label: "Business name",
    required: true,
    aliases: [
      "businessname",
      "business",
      "company",
      "companyname",
      "name",
      "organization",
      "organisation",
      "title",
      "store",
      "shop",
      "clinic",
      "place",
      "placename",
      "listing",
      "brand",
    ],
  },
  {
    key: "category",
    label: "Category",
    aliases: ["category", "type", "industry", "niche", "businesstype", "maincategory"],
  },
  {
    key: "phone",
    label: "Phone",
    aliases: [
      "phone",
      "phonenumber",
      "mobile",
      "mobilenumber",
      "telephone",
      "tel",
      "contactnumber",
      "cell",
      "whatsapp",
      "number",
      "phone1",
    ],
  },
  {
    key: "email",
    label: "Email",
    aliases: ["email", "emailaddress", "mail", "email1", "contactemail"],
  },
  {
    key: "website",
    label: "Website",
    aliases: ["website", "web", "url", "site", "domain", "homepage", "websiteurl"],
  },
  {
    key: "address",
    label: "Address",
    aliases: ["address", "fulladdress", "street", "streetaddress", "location"],
  },
  { key: "city", label: "City", aliases: ["city", "town", "locality"] },
  { key: "country", label: "Country", aliases: ["country", "nation"] },
  {
    key: "contactName",
    label: "Contact person",
    aliases: [
      "contactperson",
      "contactname",
      "contact",
      "owner",
      "person",
      "fullname",
      "ownername",
    ],
  },
  {
    key: "contactRole",
    label: "Contact role",
    aliases: ["role", "position", "jobtitle", "designation"],
  },
  {
    key: "sourceUrl",
    label: "Google profile link",
    aliases: [
      "googlebusinessprofile",
      "googleprofile",
      "mapsurl",
      "googlemapsurl",
      "googlemaps",
      "placeurl",
      "profile",
      "gmb",
      "listingurl",
      "maplink",
      "mapslink",
    ],
  },
  { key: "tags", label: "Tags", aliases: ["tags", "tag", "labels", "label"] },
  { key: "stage", label: "Stage", aliases: ["stage", "status", "pipelinestage", "leadstatus"] },
  { key: "priority", label: "Priority", aliases: ["priority"] },
  {
    key: "dealValue",
    label: "Deal value",
    aliases: ["dealvalue", "value", "amount", "deal", "budget"],
  },
  {
    key: "notes",
    label: "Notes",
    aliases: ["notes", "note", "comments", "comment", "remarks", "description"],
  },
];

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

export type ColumnMapping = Partial<Record<ImportField, string>>;

/** Picks a column for each field: exact alias matches first, then headers containing an alias. */
export function autoMap(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  const normalized = headers.map((h) => ({ h, n: norm(h) }));
  for (const pass of ["exact", "contains"] as const) {
    for (const field of IMPORT_FIELDS) {
      if (mapping[field.key]) continue;
      for (const alias of field.aliases) {
        const hit = normalized.find(
          ({ h, n }) =>
            !used.has(h) &&
            (pass === "exact" ? n === alias : alias.length > 3 && n.includes(alias)),
        );
        if (hit) {
          mapping[field.key] = hit.h;
          used.add(hit.h);
          break;
        }
      }
    }
  }
  return mapping;
}

export interface ParsedFile {
  sheets: string[];
  read: (sheet: string) => { headers: string[]; rows: Record<string, string>[] };
}

/** File#arrayBuffer with a FileReader fallback for older browsers. */
function readFile(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.readAsArrayBuffer(file);
  });
}

/** Reads CSV / Excel in the browser. Cells come back as the text shown in the spreadsheet. */
export async function parseSpreadsheet(file: File): Promise<ParsedFile> {
  const buffer = await readFile(file);
  const book = XLSX.read(buffer, { type: "array", cellDates: true, codepage: 65001 });
  return {
    sheets: book.SheetNames,
    read(sheet) {
      const ws = book.Sheets[sheet];
      if (!ws) return { headers: [], rows: [] };
      // raw:false keeps phone numbers as written instead of turning them into 3.0012E+9.
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "", raw: false });
      const nonEmpty = rows.filter((r) => Object.values(r).some((v) => String(v).trim()));
      // Column keys as SheetJS names them (repeated headers become "Phone_1"); skip header-less columns.
      const headers = [...new Set(nonEmpty.slice(0, 200).flatMap((r) => Object.keys(r)))].filter(
        (h) => !h.startsWith("__EMPTY"),
      );
      return { headers, rows: nonEmpty };
    },
  };
}

export function applyMapping(rows: Record<string, string>[], mapping: ColumnMapping): ImportRow[] {
  const pairs = Object.entries(mapping).filter(([, col]) => col) as [ImportField, string][];
  return rows.map((r) =>
    Object.fromEntries(pairs.map(([field, col]) => [field, String(r[col] ?? "").trim()])),
  );
}

export const SAMPLE_CSV = [
  "Business Name,Category,Phone,Email,Website,Address,City,Country,Contact Person,Tags,Notes",
  'Smile Dental Clinic,Dentist,+92 300 1234567,info@smiledental.pk,smiledental.pk,"12 Main Blvd, F-7",Islamabad,Pakistan,Dr. Sara Khan,"vip, referral",Met at the expo',
  "Green Leaf Cafe,Cafe,0321 7654321,,,,Lahore,Pakistan,,,",
].join("\n");
