export interface Country {
  code: string;
  name: string;
  dial: string;
  cities: string[];
}

export const COUNTRIES: Country[] = [
  { code: "US", name: "United States", dial: "+1", cities: ["New York", "Los Angeles", "Chicago", "Houston", "Austin", "Seattle", "Miami", "Denver"] },
  { code: "GB", name: "United Kingdom", dial: "+44", cities: ["London", "Manchester", "Birmingham", "Leeds", "Glasgow", "Bristol"] },
  { code: "CA", name: "Canada", dial: "+1", cities: ["Toronto", "Vancouver", "Montreal", "Calgary", "Ottawa"] },
  { code: "AU", name: "Australia", dial: "+61", cities: ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide"] },
  { code: "DE", name: "Germany", dial: "+49", cities: ["Berlin", "Munich", "Hamburg", "Frankfurt", "Cologne"] },
  { code: "AE", name: "United Arab Emirates", dial: "+971", cities: ["Dubai", "Abu Dhabi", "Sharjah"] },
  { code: "SG", name: "Singapore", dial: "+65", cities: ["Singapore"] },
  { code: "NL", name: "Netherlands", dial: "+31", cities: ["Amsterdam", "Rotterdam", "The Hague", "Utrecht"] },
  { code: "FR", name: "France", dial: "+33", cities: ["Paris", "Lyon", "Marseille", "Toulouse"] },
  { code: "IE", name: "Ireland", dial: "+353", cities: ["Dublin", "Cork", "Galway"] },
  { code: "NZ", name: "New Zealand", dial: "+64", cities: ["Auckland", "Wellington", "Christchurch"] },
  { code: "ZA", name: "South Africa", dial: "+27", cities: ["Cape Town", "Johannesburg", "Durban"] },
];

export const NICHES = [
  "Dental Clinics",
  "Real Estate Agencies",
  "Restaurants",
  "IT Companies",
  "Law Firms",
  "Fitness Studios",
  "Auto Repair Shops",
  "Coffee Shops",
  "Accounting Firms",
  "Wedding Photographers",
];

export const SOURCES = [
  "Public Business Directory",
  "Chamber of Commerce Listing",
  "Open Business Registry",
  "Public Licensing Records",
  "Industry Association List",
  "Local Government Portal",
];

export function countryByName(name: string): Country | undefined {
  return COUNTRIES.find((c) => c.name === name);
}
