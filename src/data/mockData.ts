import { COUNTRIES, NICHES, SOURCES, countryByName } from "./countries";
import type { ChartPoint, ExportRecord, Lead, SearchRecord } from "@/types";

/* Deterministic pseudo-random generator so mock data is stable across reloads. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PREFIXES = [
  "Bright", "Summit", "Golden", "Harbor", "Pinnacle", "Crescent", "Silverline",
  "Northgate", "Bluewave", "Cedar", "Ironwood", "Lakeside", "Meridian", "Oakfield",
  "Redwood", "Stonebridge", "Sunrise", "Trillium", "Vantage", "Westbrook",
  "Amber", "Beacon", "Crystal", "Eastfield", "Fairview", "Granite", "Highland",
  "Juniper", "Keystone", "Larkspur",
];

const SUFFIXES: Record<string, string[]> = {
  "Dental Clinics": ["Dental Studio", "Family Dentistry", "Orthodontic Center", "Smile Clinic", "Dental Care Group"],
  "Real Estate Agencies": ["Realty Group", "Property Partners", "Estates & Co.", "Homes Agency", "Property Advisors"],
  "Restaurants": ["Kitchen", "Bistro", "Grill House", "Dining Room", "Eatery"],
  "IT Companies": ["Tech Solutions", "Software Labs", "Digital Systems", "IT Services", "Cloud Works"],
  "Law Firms": ["Legal Group", "Law Office", "Attorneys at Law", "Legal Partners", "Counsel Group"],
  "Fitness Studios": ["Fitness Studio", "Strength Club", "Wellness Gym", "Athletic Club", "Movement Lab"],
};

const STREET_NAMES = ["Main Street", "Oak Avenue", "Market Street", "Park Lane", "Elm Road", "Station Road", "King Street", "Union Avenue", "High Street", "Bridge Street"];

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(9 + Math.floor(n % 8), 15 + (n % 40), 0, 0);
  return d.toISOString();
};

function makeLeads(count: number): Lead[] {
  const rand = mulberry32(20260423);
  const niches = NICHES.filter((n) => SUFFIXES[n]);
  const leads: Lead[] = [];
  const seen = new Set<string>();

  let i = 0;
  while (leads.length < count && i < count * 20) {
    i++;
    const niche = niches[Math.floor(rand() * niches.length)];
    const country = COUNTRIES[Math.floor(rand() * COUNTRIES.length)];
    const city = country.cities[Math.floor(rand() * country.cities.length)];
    const prefix = PREFIXES[Math.floor(rand() * PREFIXES.length)];
    const suffix = SUFFIXES[niche][Math.floor(rand() * SUFFIXES[niche].length)];
    const name = `${prefix} ${suffix}`;
    const key = `${name.toLowerCase()}|${city.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const domain = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 18) + ".example.com";
    // All contact details are fictional placeholders, not real-world data.
    const phone = rand() < 0.82
      ? `+${country.dial.replace("+", "")} ${20 + Math.floor(rand() * 79)} ${100 + Math.floor(rand() * 899)} ${1000 + Math.floor(rand() * 8999)}`
      : null;
    const email = rand() < 0.7 ? `info@${domain}` : null;
    const website = rand() < 0.78 ? `https://www.${domain}` : null;

    leads.push({
      id: `lead-${leads.length + 1}`,
      businessName: name,
      category: niche,
      country: country.name,
      city,
      phone,
      email,
      website,
      source: SOURCES[Math.floor(rand() * SOURCES.length)],
      dateAdded: daysAgo(Math.floor(rand() * 30)),
      address: `${10 + Math.floor(rand() * 990)} ${STREET_NAMES[Math.floor(rand() * STREET_NAMES.length)]}, ${city}`,
    });
  }
  return leads;
}

export const MOCK_LEADS: Lead[] = makeLeads(54);

export const MOCK_SEARCHES: SearchRecord[] = [
  { id: "search-1", name: "Dental Clinics — US", niche: "Dental Clinics", country: "United States", city: "Austin", keyword: null, maxResults: 500, contactTypes: ["phone", "email"], onlyWithWebsites: false, date: daysAgo(1), leadsFound: 214, status: "completed", durationSeconds: 96 },
  { id: "search-2", name: "Restaurants — UK", niche: "Restaurants", country: "United Kingdom", city: "London", keyword: "seafood", maxResults: 1000, contactTypes: ["phone", "email", "website"], onlyWithWebsites: true, date: daysAgo(3), leadsFound: 486, status: "completed", durationSeconds: 142 },
  { id: "search-3", name: "IT Companies — DE", niche: "IT Companies", country: "Germany", city: "Berlin", keyword: null, maxResults: 500, contactTypes: ["email", "website"], onlyWithWebsites: true, date: daysAgo(5), leadsFound: 322, status: "completed", durationSeconds: 118 },
  { id: "search-4", name: "Real Estate — AE", niche: "Real Estate Agencies", country: "United Arab Emirates", city: "Dubai", keyword: "luxury", maxResults: 100, contactTypes: ["phone"], onlyWithWebsites: false, date: daysAgo(8), leadsFound: 87, status: "paused", durationSeconds: 44 },
  { id: "search-5", name: "Fitness Studios — CA", niche: "Fitness Studios", country: "Canada", city: "Toronto", keyword: null, maxResults: 100, contactTypes: ["phone", "email"], onlyWithWebsites: false, date: daysAgo(12), leadsFound: 0, status: "cancelled", durationSeconds: 12 },
];

export const MOCK_EXPORTS: ExportRecord[] = [
  { id: "export-1", filename: "dental-clinics-us-2026-04.csv", format: "csv", scope: "Dental Clinics — US", fields: ["Business Name", "Phone", "Email", "Website"], count: 214, date: daysAgo(1), status: "completed" },
  { id: "export-2", filename: "restaurants-uk.xlsx", format: "xlsx", scope: "Restaurants — UK", fields: ["Business Name", "Category", "Phone", "Email"], count: 486, date: daysAgo(3), status: "completed" },
  { id: "export-3", filename: "it-companies-berlin.csv", format: "csv", scope: "All leads", fields: ["Business Name", "Email"], count: 322, date: daysAgo(5), status: "completed" },
];

export const MOCK_ACTIVITY: ChartPoint[] = Array.from({ length: 14 }, (_, i) => {
  const rand = mulberry32(1000 + i);
  const d = new Date();
  d.setDate(d.getDate() - (13 - i));
  return {
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    leads: Math.floor(rand() * 90) + 15,
    searches: Math.floor(rand() * 4) + 1,
  };
});

export const USER_TIMEZONE_NOTE = "Sample businesses are fictional; contact details are placeholders for UI demonstration only.";

export { countryByName };

export function generateLeads(opts: {
  niche: string;
  country: string;
  city?: string | null;
  keyword?: string | null;
  count: number;
  seed?: number;
}): Lead[] {
  const rand = mulberry32(opts.seed ?? 7919);
  const country = countryByName(opts.country) ?? COUNTRIES[0];
  const suffixes = SUFFIXES[opts.niche] ?? ["Group", "Services", "Studio", "Center", "Partners"];
  const leads: Lead[] = [];
  const seen = new Set<string>();
  const cap = Math.min(opts.count, 150);

  let i = 0;
  while (leads.length < cap && i < cap * 20) {
    i++;
    const prefix = PREFIXES[Math.floor(rand() * PREFIXES.length)];
    const suffix = suffixes[Math.floor(rand() * suffixes.length)];
    const city = opts.city || country.cities[Math.floor(rand() * country.cities.length)];
    const name = opts.keyword && rand() < 0.35 ? `${prefix} ${opts.keyword} ${suffix}` : `${prefix} ${suffix}`;
    const key = `${name.toLowerCase()}|${city.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const domain = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 18) + ".example.com";
    const wantWebsite = rand() < 0.78;
    const phone = rand() < 0.82
      ? `+${country.dial.replace("+", "")} ${20 + Math.floor(rand() * 79)} ${100 + Math.floor(rand() * 899)} ${1000 + Math.floor(rand() * 8999)}`
      : null;
    const email = wantWebsite && rand() < 0.85 ? `info@${domain}` : null;
    const website = wantWebsite ? `https://www.${domain}` : null;

    leads.push({
      id: `gen-${opts.seed ?? 0}-${leads.length + 1}`,
      businessName: name,
      category: opts.niche,
      country: country.name,
      city,
      phone,
      email,
      website,
      source: SOURCES[Math.floor(rand() * SOURCES.length)],
      dateAdded: new Date().toISOString(),
      address: `${10 + Math.floor(rand() * 990)} ${STREET_NAMES[Math.floor(rand() * STREET_NAMES.length)]}, ${city}`,
    });
  }
  return leads;
}
