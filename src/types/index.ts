export type ContactType = "phone" | "email" | "website";

export interface Lead {
  id: string;
  businessName: string;
  category: string;
  country: string;
  city: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  source: string;
  dateAdded: string; // ISO date string
  address?: string;
}

export type SearchStatus = "completed" | "running" | "paused" | "cancelled";

export interface SearchRecord {
  id: string;
  name: string;
  niche: string;
  country: string;
  city: string | null;
  keyword: string | null;
  maxResults: number;
  contactTypes: ContactType[];
  onlyWithWebsites: boolean;
  date: string; // ISO date string
  leadsFound: number;
  status: SearchStatus;
  durationSeconds?: number;
}

export type ExportFormat = "csv" | "xlsx";

export interface ExportRecord {
  id: string;
  filename: string;
  format: ExportFormat;
  scope: string;
  fields: string[];
  count: number;
  date: string; // ISO date string
  status: "completed" | "failed";
}

export interface AppSettings {
  profileName: string;
  profileEmail: string;
  defaultCountry: string;
  defaultResultLimit: number;
  rowsPerPage: number;
  compactTable: boolean;
  autoDedupe: boolean;
  defaultPhone: boolean;
  defaultEmail: boolean;
  defaultWebsite: boolean;
  defaultOnlyWithWebsites: boolean;
  apiEndpoint: string;
  apiKeyPlaceholder: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  profileName: "Alex Morgan",
  profileEmail: "alex@leadfinderpro.io",
  defaultCountry: "United States",
  defaultResultLimit: 500,
  rowsPerPage: 10,
  compactTable: false,
  autoDedupe: true,
  defaultPhone: true,
  defaultEmail: true,
  defaultWebsite: false,
  defaultOnlyWithWebsites: false,
  apiEndpoint: "https://api.leadfinderpro.io/v1",
  apiKeyPlaceholder: "•••• •••• •••• ••••",
};

export interface ChartPoint {
  date: string;
  leads: number;
  searches: number;
}
