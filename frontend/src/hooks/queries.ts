import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import { api } from "@/lib/api";
import {
  DEFAULT_SETTINGS,
  type LeadQuery,
  type MatchKey,
  type Permission,
  type PipelineColumn,
  type SearchRecord,
  type SettingsUpdate,
} from "@/types";

export const queryKeys = {
  auth: ["auth"] as const,
  users: ["users"] as const,
  sessions: ["auth", "sessions"] as const,
  health: ["health"] as const,
  imports: ["imports"] as const,
  notifications: ["notifications"] as const,
  enrich: ["leads", "enrich"] as const,
  auditSummary: (from: string, to: string) => ["audit", "summary", from, to] as const,
  audit: (query: object) => ["audit", "list", query] as const,
  leadHistory: (id: string) => ["audit", "lead", id] as const,
  backups: ["backups"] as const,
  duplicates: (matchOn: string[]) => ["leads", "duplicates", matchOn] as const,
  stats: ["stats"] as const,
  settings: ["settings"] as const,
  searches: ["searches"] as const,
  search: (id: string) => ["searches", id] as const,
  leads: (query: LeadQuery) => ["leads", query] as const,
  leadFacets: ["leads", "facets"] as const,
  exports: ["exports"] as const,
  lead: (id: string) => ["leads", "detail", id] as const,
  tasks: (status: string) => ["tasks", status] as const,
  pipeline: (query: object) => ["leads", "pipeline", query] as const,
  senders: ["senders"] as const,
  templates: ["templates"] as const,
  campaigns: ["campaigns"] as const,
  campaign: (id: string) => ["campaigns", id] as const,
  suppressions: ["suppressions"] as const,
};

/**
 * The server renders pages without data, but TanStack Start hydrates in stages: by the time a
 * page hydrates, another component may already have filled the shared cache. Hiding cached data
 * until this subtree has hydrated keeps the first client render identical to the server HTML.
 */
function useHydrationSafe<T extends { data: unknown }>(result: T): T {
  const hydrated = useHydrated();
  return hydrated
    ? result
    : ({ ...result, data: undefined, isPending: true, isSuccess: false } as T);
}

const hasActive = (searches?: SearchRecord[]) =>
  !!searches?.some((s) => s.status === "running" || s.status === "paused");

/** Everything derived from leads/searches; invalidate after a search finishes or data is deleted. */
export function useInvalidateData() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["leads"] }),
      qc.invalidateQueries({ queryKey: queryKeys.searches }),
      qc.invalidateQueries({ queryKey: queryKeys.stats }),
      qc.invalidateQueries({ queryKey: ["tasks"] }),
    ]);
}

export function useHealth() {
  return useHydrationSafe(
    useQuery({
      queryKey: queryKeys.health,
      queryFn: api.health,
      refetchInterval: 30000,
      retry: false,
    }),
  );
}

export function useSettings() {
  const query = useHydrationSafe(
    useQuery({ queryKey: queryKeys.settings, queryFn: api.getSettings, staleTime: 60000 }),
  );
  return { ...query, settings: query.data ?? DEFAULT_SETTINGS };
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsUpdate) => api.updateSettings(patch),
    onSuccess: (settings) => {
      qc.setQueryData(queryKeys.settings, settings);
      void qc.invalidateQueries({ queryKey: queryKeys.health });
    },
  });
}

export function useSearches() {
  return useHydrationSafe(
    useQuery({
      queryKey: queryKeys.searches,
      queryFn: api.listSearches,
      // Keep history live while a scraper is working.
      refetchInterval: (q) => (hasActive(q.state.data) ? 3000 : false),
    }),
  );
}

export function useStats() {
  const { data: searches } = useSearches();
  return useHydrationSafe(
    useQuery({
      queryKey: queryKeys.stats,
      queryFn: api.stats,
      refetchInterval: hasActive(searches) ? 5000 : false,
    }),
  );
}

export function useLeads(query: LeadQuery) {
  return useHydrationSafe(
    useQuery({
      queryKey: queryKeys.leads(query),
      queryFn: () => api.listLeads(query),
      placeholderData: keepPreviousData,
    }),
  );
}

export function useLeadFacets() {
  return useHydrationSafe(
    useQuery({ queryKey: queryKeys.leadFacets, queryFn: api.leadFacets, staleTime: 30000 }),
  );
}

export function useExports() {
  return useHydrationSafe(useQuery({ queryKey: queryKeys.exports, queryFn: api.listExports }));
}

export function useLead(id: string) {
  return useHydrationSafe(
    useQuery({ queryKey: queryKeys.lead(id), queryFn: () => api.getLead(id) }),
  );
}

export function useTasks(status: "open" | "done" = "open") {
  return useHydrationSafe(
    useQuery({ queryKey: queryKeys.tasks(status), queryFn: () => api.listTasks(status) }),
  );
}

export function usePipeline(query: Parameters<typeof api.pipeline>[0]) {
  return useHydrationSafe(
    useQuery<PipelineColumn[]>({
      queryKey: queryKeys.pipeline(query),
      queryFn: () => api.pipeline(query),
      placeholderData: keepPreviousData,
    }),
  );
}

export function useSenders() {
  return useHydrationSafe(useQuery({ queryKey: queryKeys.senders, queryFn: api.listSenders }));
}

export function useTemplates() {
  return useHydrationSafe(useQuery({ queryKey: queryKeys.templates, queryFn: api.listTemplates }));
}

const campaignActive = (status?: string) => status === "sending";

export function useCampaigns() {
  return useHydrationSafe(
    useQuery({
      queryKey: queryKeys.campaigns,
      queryFn: api.listCampaigns,
      refetchInterval: (q) => (q.state.data?.some((c) => campaignActive(c.status)) ? 5000 : false),
    }),
  );
}

export function useCampaign(id: string) {
  return useHydrationSafe(
    useQuery({
      queryKey: queryKeys.campaign(id),
      queryFn: () => api.getCampaign(id),
      // Follow progress live while emails are going out.
      refetchInterval: (q) => (campaignActive(q.state.data?.campaign.status) ? 3000 : false),
    }),
  );
}

export function useSuppressions() {
  return useHydrationSafe(
    useQuery({ queryKey: queryKeys.suppressions, queryFn: api.listSuppressions }),
  );
}

/** Who is signed in. Refetched whenever the API reports the session is gone. */
export function useAuth() {
  const query = useHydrationSafe(
    useQuery({
      queryKey: queryKeys.auth,
      queryFn: api.authStatus,
      staleTime: Infinity,
      retry: false,
    }),
  );
  const user = query.data?.user ?? null;
  const isAdmin = user?.role === "admin";
  /** Mirrors the server's defaults (services/access.js); the API enforces these either way. */
  const can = (permission: Permission) =>
    isAdmin ||
    (
      { import: true, export: false, campaigns: true, ...user?.permissions } as Record<
        Permission,
        boolean
      >
    )[permission];
  return { ...query, user, isAdmin, can };
}

/** The team list (admin-only API: pass enabled=false for members). */
export function useUsers(enabled = true) {
  return useHydrationSafe(useQuery({ queryKey: queryKeys.users, queryFn: api.listUsers, enabled }));
}

export function useSessions() {
  return useHydrationSafe(useQuery({ queryKey: queryKeys.sessions, queryFn: api.listSessions }));
}

export function useImports() {
  return useHydrationSafe(useQuery({ queryKey: queryKeys.imports, queryFn: api.listImports }));
}

export function useDuplicates(matchOn: MatchKey[]) {
  return useHydrationSafe(
    useQuery({
      queryKey: queryKeys.duplicates(matchOn),
      queryFn: () => api.duplicates(matchOn),
      placeholderData: keepPreviousData,
    }),
  );
}

/** The current/last enrich job; polled while it runs. */
export function useEnrichJob() {
  return useHydrationSafe(
    useQuery({
      queryKey: queryKeys.enrich,
      queryFn: api.enrichStatus,
      refetchInterval: (q) => (q.state.data?.status === "running" ? 2000 : false),
    }),
  );
}

export function useBackups() {
  return useHydrationSafe(useQuery({ queryKey: queryKeys.backups, queryFn: api.listBackups }));
}

export function useAuditSummary(from: string, to: string) {
  return useHydrationSafe(
    useQuery({
      queryKey: queryKeys.auditSummary(from, to),
      queryFn: () => api.auditSummary(from, to),
      refetchInterval: 30000,
    }),
  );
}

export function useLeadHistory(leadId: string, enabled: boolean) {
  return useHydrationSafe(
    useQuery({
      queryKey: queryKeys.leadHistory(leadId),
      queryFn: () => api.leadHistory(leadId),
      enabled,
    }),
  );
}

/** The signed-in person's notifications, refreshed every 30 seconds. */
export function useNotifications() {
  return useHydrationSafe(
    useQuery({
      queryKey: queryKeys.notifications,
      queryFn: api.notifications,
      refetchInterval: 30000,
    }),
  );
}
