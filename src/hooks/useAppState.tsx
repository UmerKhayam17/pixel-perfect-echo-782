import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { MOCK_EXPORTS, MOCK_LEADS, MOCK_SEARCHES } from "@/data/mockData";
import { DEFAULT_SETTINGS, type AppSettings, type ExportRecord, type Lead, type SearchRecord } from "@/types";

const STORAGE_KEY = "leadfinder-pro-state-v1";

interface PersistedState {
  leads: Lead[];
  searches: SearchRecord[];
  exports: ExportRecord[];
  settings: AppSettings;
}

interface AppContextValue extends PersistedState {
  addLeads: (leads: Lead[]) => number;
  addSearch: (search: SearchRecord) => void;
  updateSearch: (id: string, patch: Partial<SearchRecord>) => void;
  addExport: (record: ExportRecord) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  resetData: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function load(): PersistedState {
  const fallback: PersistedState = {
    leads: MOCK_LEADS,
    searches: MOCK_SEARCHES,
    exports: MOCK_EXPORTS,
    settings: DEFAULT_SETTINGS,
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      leads: parsed.leads ?? fallback.leads,
      searches: parsed.searches ?? fallback.searches,
      exports: parsed.exports ?? fallback.exports,
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
    };
  } catch {
    return fallback;
  }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>(MOCK_LEADS);
  const [searches, setSearches] = useState<SearchRecord[]>(MOCK_SEARCHES);
  const [exports, setExports] = useState<ExportRecord[]>(MOCK_EXPORTS);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const state = load();
    setLeads(state.leads);
    setSearches(state.searches);
    setExports(state.exports);
    setSettings(state.settings);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ leads, searches, exports, settings }),
      );
    } catch {
      /* storage full — in-memory state still works */
    }
  }, [leads, searches, exports, settings, hydrated]);

  const addLeads = useCallback((incoming: Lead[]) => {
    let added = 0;
    setLeads((prev) => {
      const seen = new Set(
        prev.map((l) => `${l.businessName.toLowerCase()}|${l.city.toLowerCase()}`),
      );
      const unique = incoming.filter((l) => {
        const key = `${l.businessName.toLowerCase()}|${l.city.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      added = unique.length;
      return [...unique, ...prev];
    });
    return incoming.length;
  }, []);

  const addSearch = useCallback((search: SearchRecord) => {
    setSearches((prev) => [search, ...prev]);
  }, []);

  const updateSearch = useCallback((id: string, patch: Partial<SearchRecord>) => {
    setSearches((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const addExport = useCallback((record: ExportRecord) => {
    setExports((prev) => [record, ...prev]);
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetData = useCallback(() => {
    setLeads(MOCK_LEADS);
    setSearches(MOCK_SEARCHES);
    setExports(MOCK_EXPORTS);
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return (
    <AppContext.Provider
      value={{ leads, searches, exports, settings, addLeads, addSearch, updateSearch, addExport, updateSettings, resetData }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppState(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
