import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { LEAD_FIELDS } from "@/utils/exporters";
import { SAMPLE_CSV, applyMapping, autoMap, parseSpreadsheet } from "@/utils/importMapping";

const fileFrom = (data: BlobPart, name: string) => new File([data], name);

describe("autoMap", () => {
  it("recognises common header names", () => {
    const m = autoMap(["Company Name", "Mobile", "E-mail", "Web Site", "Town", "Contact Person", "Remarks"]);
    expect(m).toMatchObject({
      businessName: "Company Name",
      phone: "Mobile",
      email: "E-mail",
      website: "Web Site",
      city: "Town",
      contactName: "Contact Person",
      notes: "Remarks",
    });
  });

  it("maps every column of a LeadFinder export back to its field", () => {
    const m = autoMap(LEAD_FIELDS.map((f) => f.label));
    expect(m).toMatchObject({
      businessName: "Business Name",
      phone: "Phone Number",
      email: "Email Address",
      website: "Website",
      sourceUrl: "Google Business Profile",
      contactName: "Contact Person",
      stage: "Stage",
      dealValue: "Deal Value",
      tags: "Tags",
    });
    // "Lead Score", "Date Added" etc. have no import field and stay unmapped.
    expect(Object.values(m)).not.toContain("Lead Score");
  });

  it("never maps one column to two fields", () => {
    const m = autoMap(["Name", "Phone"]);
    const cols = Object.values(m);
    expect(new Set(cols).size).toBe(cols.length);
  });
});

describe("parseSpreadsheet", () => {
  it("reads CSV with quoted commas and keeps phone numbers as text", async () => {
    const parsed = await parseSpreadsheet(fileFrom(SAMPLE_CSV, "leads.csv"));
    const { headers, rows } = parsed.read(parsed.sheets[0]!);
    expect(headers).toContain("Business Name");
    expect(rows).toHaveLength(2);
    expect(rows[0]!["Address"]).toBe("12 Main Blvd, F-7");
    expect(rows[1]!["Phone"]).toBe("0321 7654321");
  });

  it("reads Excel files, skipping blank rows", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Business", "Phone", "Email"],
      ["Alpha Dental", "03001234567", "a@alpha.pk"],
      ["", "", ""],
      ["Beta Clinic", "+92 51 1234567", ""],
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Leads");
    const data = XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const parsed = await parseSpreadsheet(fileFrom(data, "leads.xlsx"));
    expect(parsed.sheets).toEqual(["Leads"]);
    const { rows, headers } = parsed.read("Leads");
    expect(headers).toEqual(["Business", "Phone", "Email"]);
    expect(rows.map((r) => r["Business"])).toEqual(["Alpha Dental", "Beta Clinic"]);
    expect(applyMapping(rows, autoMap(headers))[0]).toEqual({ businessName: "Alpha Dental", phone: "03001234567", email: "a@alpha.pk" });
  });
});
