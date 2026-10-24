import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  CopyX,
  Download,
  FileUp,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Globe,
  GlobeOff,
  Loader2,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  Sparkles,
  Shuffle,
  UserPlus,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  Flag,
  Pin,
  PinOff,
  Tag,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MissingBadge } from "@/components/StatusBadge";
import { ProfileLink, WebsiteLink } from "@/components/LeadResultsTable";
import { PRIORITIES, PriorityBadge, STAGES, StageBadge, TagChips } from "@/components/CrmBadges";
import { PinnedMark, WhatsAppBadge, WorkInfo } from "@/components/LeadQuickActions";
import { copyText } from "@/components/DetailRow";
import { LeadFormDialog } from "@/components/LeadFormDialog";
import { DistributeDialog, type DistributeTarget } from "@/components/DistributeDialog";
import { EnrichBanner } from "@/components/EnrichBanner";
import { OpportunityBadge, RatingBadge } from "@/components/LeadInsights";
import { createCampaignDraft } from "@/components/CampaignStatusBadge";
import {
  queryKeys,
  useAuth,
  useImports,
  useInvalidateData,
  useLeadFacets,
  useLeads,
  useSearches,
  useSettings,
  useUsers,
} from "@/hooks/queries";
import { api } from "@/lib/api";
import { exportLeads } from "@/lib/exportLeads";
import { DEFAULT_EXPORT_FIELD_KEYS } from "@/utils/exporters";
import { formatMoney, formatNumber, relativeTime } from "@/utils/format";
import type {
  ContactType,
  ExportFormat,
  Lead,
  LeadInput,
  LeadQuery,
  LeadSort,
  LeadStage,
} from "@/types";

interface LeadsSearch {
  whatsapp?: "yes" | "no" | "unknown" | "landline" | undefined;
  q?: string | undefined;
  country?: string | undefined;
  category?: string | undefined;
  searchId?: string | undefined;
  importId?: string | undefined;
  assignedTo?: string | undefined;
  stage?: string | undefined;
  tag?: string | undefined;
  has?: string | undefined;
  missing?: string | undefined;
  minRating?: number | undefined;
  minReviews?: number | undefined;
  hideClosed?: boolean | undefined;
  sort?: LeadSort | undefined;
  page?: number | undefined;
}

const SORT_OPTIONS: { value: LeadSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name (A–Z)" },
  { value: "city", label: "City (A–Z)" },
  { value: "score", label: "Highest score" },
  { value: "value", label: "Highest deal value" },
  { value: "contacted", label: "Recently contacted" },
  { value: "opportunity", label: "Best opportunity" },
  { value: "rating", label: "Highest rated" },
  { value: "reviews", label: "Most reviews" },
];

const RATING_OPTIONS = [4, 4.5];
const REVIEW_OPTIONS = [10, 50, 100];

export const Route = createFileRoute("/leads")({
  validateSearch: (params: Record<string, unknown>): LeadsSearch => {
    const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
    const sort = str(params["sort"]);
    const page = Number(params["page"]);
    return {
      q: str(params["q"]),
      country: str(params["country"]),
      category: str(params["category"]),
      searchId: str(params["searchId"]),
      importId: str(params["importId"]),
      assignedTo: str(params["assignedTo"]),
      whatsapp: ["yes", "no", "unknown", "landline"].includes(str(params["whatsapp"]) ?? "")
        ? (params["whatsapp"] as LeadsSearch["whatsapp"])
        : undefined,
      stage: str(params["stage"]),
      tag: str(params["tag"]),
      has: str(params["has"]),
      missing: str(params["missing"]),
      minRating: Number(params["minRating"]) > 0 ? Number(params["minRating"]) : undefined,
      minReviews: Number(params["minReviews"]) > 0 ? Number(params["minReviews"]) : undefined,
      hideClosed:
        params["hideClosed"] === true || params["hideClosed"] === "true" ? true : undefined,
      sort: SORT_OPTIONS.some((o) => o.value === sort) ? (sort as LeadSort) : undefined,
      page: Number.isInteger(page) && page > 1 ? page : undefined,
    };
  },
  head: () => ({
    meta: [
      { title: "All Leads — LeadFinder Pro" },
      { name: "description", content: "Browse, filter, and export every collected business lead." },
    ],
  }),
  component: LeadsPage,
});

const ALL = "__all__";
const OPEN_STAGES = "new,contacted,qualified,proposal";

function LeadsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/leads" });
  const qc = useQueryClient();
  const invalidateData = useInvalidateData();
  const { settings } = useSettings();
  const { isAdmin, can, user } = useAuth();
  const { data: staff = [] } = useUsers(isAdmin);
  const ownerName = (l: Lead) => {
    const id = typeof l.assignedTo === "object" ? l.assignedTo?.id : l.assignedTo;
    if (!id) return null;
    if (id === user?.id) return "You";
    return staff.find((u) => u.id === id)?.name ?? "A teammate";
  };
  const { data: facets } = useLeadFacets();
  const { data: searches } = useSearches();

  const has = useMemo(
    () =>
      search.has
        ?.split(",")
        .filter((h): h is ContactType => ["phone", "email", "website"].includes(h)) ?? [],
    [search.has],
  );
  const stages = useMemo(
    () =>
      search.stage?.split(",").filter((s): s is LeadStage => STAGES.some((x) => x.value === s)) ??
      [],
    [search.stage],
  );
  const page = search.page ?? 1;
  const query: LeadQuery = {
    q: search.q,
    country: search.country,
    category: search.category,
    searchId: search.searchId,
    importId: search.importId,
    assignedTo: search.assignedTo,
    whatsapp: search.whatsapp,
    stage: stages,
    tag: search.tag,
    has,
    missing: search.missing === "website" ? ["website"] : undefined,
    minRating: search.minRating,
    minReviews: search.minReviews,
    hideClosed: search.hideClosed,
    sort: search.sort ?? "newest",
    page,
    limit: settings.rowsPerPage,
  };
  const { data, isPending, isError, error, isFetching } = useLeads(query);
  const leads = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / settings.rowsPerPage));

  const [qInput, setQInput] = useState(search.q ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [bulkTag, setBulkTag] = useState("");
  const [distributing, setDistributing] = useState<DistributeTarget | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [exporting, setExporting] = useState(false);
  async function quickUpdate(id: string, patch: LeadInput, success: string) {
    try {
      await api.updateLead(id, patch);
      toast.success(success);
      void invalidateData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the lead.");
    }
  }
  // Phones: filters fold away behind a button so the list starts on the first screen.
  const [showFilters, setShowFilters] = useState(false);

  const setSearch = (patch: Partial<LeadsSearch>, resetPage = true) =>
    navigate({
      search: (prev) => ({ ...prev, ...patch, ...(resetPage ? { page: undefined } : {}) }),
    });

  // Debounce the free-text search into the URL.
  useEffect(() => {
    if ((search.q ?? "") === qInput) return;
    const t = window.setTimeout(() => void setSearch({ q: qInput || undefined }), 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  // Selection only applies to the visible page.
  useEffect(
    () => setSelected(new Set()),
    [
      data?.page,
      search.q,
      search.country,
      search.category,
      search.has,
      search.searchId,
      search.importId,
      search.assignedTo,
      search.stage,
      search.tag,
      search.missing,
      search.minRating,
      search.minReviews,
    ],
  );

  const sourceSearch = search.searchId
    ? searches?.find((s) => s.id === search.searchId)
    : undefined;
  const { data: imports } = useImports();
  const sourceImport = search.importId ? imports?.find((i) => i.id === search.importId) : undefined;
  const filtersActive = !!(
    search.q ||
    search.country ||
    search.category ||
    search.has ||
    search.searchId ||
    search.stage ||
    search.tag ||
    search.missing ||
    search.importId ||
    search.minRating ||
    search.minReviews ||
    search.assignedTo ||
    search.whatsapp
  );
  const allOnPageSelected = leads.length > 0 && leads.every((l) => selected.has(l.id));

  const scope = sourceSearch
    ? sourceSearch.name
    : sourceImport
      ? `Import: ${sourceImport.filename}`
      : filtersActive
        ? [
            stages.map((s) => STAGES.find((x) => x.value === s)?.label).join("/"),
            search.tag && `#${search.tag}`,
            search.missing === "website" && "No website",
            search.category,
            search.country,
            search.q && `“${search.q}”`,
          ]
            .filter(Boolean)
            .join(" · ") || "Filtered leads"
        : "All leads";

  async function runExport(format: ExportFormat, ids?: string[]) {
    setExporting(true);
    try {
      const { page: _p, limit: _l, ...filters } = query;
      const record = await exportLeads({
        query: filters,
        ids,
        format,
        fieldKeys: DEFAULT_EXPORT_FIELD_KEYS,
        scope: ids ? `${ids.length} selected leads` : scope,
      });
      void qc.invalidateQueries({ queryKey: queryKeys.exports });
      toast.success(`Exported ${formatNumber(record.count)} leads to ${record.filename}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      if (pendingDelete.length === 1) await api.deleteLead(pendingDelete[0]!);
      else await api.deleteLeads(pendingDelete);
      toast.success(
        `${pendingDelete.length === 1 ? "Lead" : `${pendingDelete.length} leads`} deleted.`,
      );
      setSelected(new Set());
      void invalidateData();
      void qc.invalidateQueries({ queryKey: queryKeys.leadFacets });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setPendingDelete(null);
    }
  }

  async function bulkUpdate(
    input: Omit<Parameters<typeof api.bulkUpdateLeads>[0], "ids">,
    success: string,
  ) {
    try {
      await api.bulkUpdateLeads({ ids: [...selected], ...input });
      toast.success(success);
      setSelected(new Set());
      setBulkTag("");
      void invalidateData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    }
  }

  async function emailLeads(ids?: string[]) {
    try {
      const { page: _p, limit: _l, sort: _s, ...filters } = query;
      const campaign = await createCampaignDraft(
        ids
          ? { leadIds: ids, label: `${ids.length} selected leads` }
          : {
              query: {
                ...filters,
                stage: filters.stage?.join(",") || undefined,
                has: filters.has?.join(",") || undefined,
                missing: filters.missing?.join(",") || undefined,
              } as never,
              label: scope,
            },
      );
      void navigate({ to: "/campaigns/$id", params: { id: campaign.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the campaign.");
    }
  }

  const { page: _pg, limit: _lim, sort: _so, ...enrichQuery } = query;
  async function runEnrich(input: { ids?: string[]; query?: LeadQuery }) {
    try {
      const job = await api.startEnrich({ ...input, onlyMissing: true });
      toast.success(`Checking ${formatNumber(job.leads)} leads in the background.`);
      void qc.invalidateQueries({ queryKey: queryKeys.enrich });
      setSelected(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the check.");
    }
  }

  async function assign(userId: string | null, name: string | null) {
    try {
      const { updated } = await api.assignLeads([...selected], userId);
      toast.success(
        name ? `${updated} leads assigned to ${name}.` : `${updated} leads unassigned.`,
      );
      setSelected(new Set());
      void invalidateData();
      void qc.invalidateQueries({ queryKey: queryKeys.users });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not assign.");
    }
  }

  const cellPad = settings.compactTable ? "py-1.5" : "py-3";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold">All leads</h2>
          <p className="text-sm text-muted-foreground">
            {isPending
              ? "Loading…"
              : `${formatNumber(total)} ${filtersActive ? "matching" : "collected"} businesses`}
            {isFetching && !isPending && (
              <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin" />
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={exporting || total === 0}>
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {can("export") ? `Export ${filtersActive ? "filtered" : "all"}` : "Actions"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {can("export") && (
                <>
                  <DropdownMenuItem onClick={() => runExport("csv")}>
                    <FileText className="h-4 w-4" /> CSV ({formatNumber(total)} leads)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => runExport("xlsx")}>
                    <FileSpreadsheet className="h-4 w-4" /> Excel ({formatNumber(total)} leads)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/export-center">Choose fields in Export Center…</Link>
                  </DropdownMenuItem>
                </>
              )}
              {isAdmin && (
                <DropdownMenuItem asChild>
                  <Link to="/duplicates">
                    <CopyX className="h-4 w-4" /> Find duplicate leads…
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => runEnrich({ query: enrichQuery })}>
                <Sparkles className="h-4 w-4" /> Check websites & Google ratings for these{" "}
                {formatNumber(total)} leads
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem
                  onClick={() => setDistributing({ query: enrichQuery, label: scope })}
                >
                  <Shuffle className="h-4 w-4" /> Distribute these {formatNumber(total)} leads to
                  staff…
                </DropdownMenuItem>
              )}
              {can("campaigns") && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => emailLeads()}>
                    <Megaphone className="h-4 w-4" /> Email campaign to these {formatNumber(total)}{" "}
                    leads
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add lead
          </Button>
          {can("import") && (
            <Button asChild variant="outline">
              <Link to="/import">
                <FileUp className="h-4 w-4" /> Import
              </Link>
            </Button>
          )}
          {isAdmin && (
            <Button asChild>
              <Link to="/find-leads">
                <Search className="h-4 w-4" /> Find leads
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card className="card-shadow rounded-xl py-0">
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="relative lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search name, email, phone, website…"
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            className="lg:hidden"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
          >
            <SlidersHorizontal className="h-4 w-4" /> {showFilters ? "Hide filters" : "Filters"}
            {filtersActive && !showFilters && <span className="h-2 w-2 rounded-full bg-primary" />}
          </Button>
          <div
            className={`${showFilters ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "hidden"} lg:contents`}
          >
            <Select
              value={search.stage ?? ALL}
              onValueChange={(v) => setSearch({ stage: v === ALL ? undefined : v })}
            >
              <SelectTrigger className="lg:w-40">
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All stages</SelectItem>
                <SelectItem value={OPEN_STAGES}>Open (not closed)</SelectItem>
                {STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    <span className={`h-2 w-2 rounded-full ${s.dot}`} /> {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!!facets?.tags.length && (
              <Select
                value={search.tag ?? ALL}
                onValueChange={(v) => setSearch({ tag: v === ALL ? undefined : v })}
              >
                <SelectTrigger className="lg:w-36">
                  <SelectValue placeholder="Tag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All tags</SelectItem>
                  {facets.tags.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select
              value={search.country ?? ALL}
              onValueChange={(v) => setSearch({ country: v === ALL ? undefined : v })}
            >
              <SelectTrigger className="lg:w-44">
                <SelectValue placeholder="Country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All countries</SelectItem>
                {facets?.countries.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={search.category ?? ALL}
              onValueChange={(v) => setSearch({ category: v === ALL ? undefined : v })}
            >
              <SelectTrigger className="lg:w-44">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All categories</SelectItem>
                {facets?.categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ToggleGroup
              type="multiple"
              variant="outline"
              value={has}
              onValueChange={(v: string[]) =>
                setSearch({
                  has: v.length ? v.join(",") : undefined,
                  ...(v.includes("website") ? { missing: undefined } : {}),
                })
              }
              aria-label="Only leads with"
            >
              <ToggleGroupItem value="phone" aria-label="Has phone" title="Has phone">
                <Phone className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="email" aria-label="Has email" title="Has email">
                <Mail className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="website" aria-label="Has website" title="Has website">
                <Globe className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
            <Toggle
              variant="outline"
              pressed={search.missing === "website"}
              onPressedChange={(on) =>
                setSearch({
                  missing: on ? "website" : undefined,
                  // "Has website" and "No website" can't both apply.
                  has: on ? has.filter((h) => h !== "website").join(",") || undefined : search.has,
                })
              }
              title="Only businesses without a website"
            >
              <GlobeOff className="h-4 w-4" /> No website
            </Toggle>
            <Select
              value={search.minRating ? String(search.minRating) : ALL}
              onValueChange={(v) => setSearch({ minRating: v === ALL ? undefined : Number(v) })}
            >
              <SelectTrigger className="lg:w-32" aria-label="Minimum rating">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any rating</SelectItem>
                {RATING_OPTIONS.map((r) => (
                  <SelectItem key={r} value={String(r)}>
                    {r.toFixed(1)}★ and up
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={search.minReviews ? String(search.minReviews) : ALL}
              onValueChange={(v) => setSearch({ minReviews: v === ALL ? undefined : Number(v) })}
            >
              <SelectTrigger className="lg:w-32" aria-label="Minimum reviews">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any reviews</SelectItem>
                {REVIEW_OPTIONS.map((r) => (
                  <SelectItem key={r} value={String(r)}>
                    {r}+ reviews
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Toggle
              variant="outline"
              pressed={!!search.hideClosed}
              onPressedChange={(on) => setSearch({ hideClosed: on || undefined })}
              title="Hide businesses Google lists as permanently closed"
            >
              Hide closed
            </Toggle>
            <Select
              value={search.assignedTo ?? ALL}
              onValueChange={(v) => setSearch({ assignedTo: v === ALL ? undefined : v })}
            >
              <SelectTrigger className="lg:w-40" aria-label="Owner">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{isAdmin ? "Any owner" : "All my leads"}</SelectItem>
                <SelectItem value="me">Assigned to me</SelectItem>
                {isAdmin && <SelectItem value="none">Unassigned</SelectItem>}
                {isAdmin &&
                  staff
                    .filter((u) => u.active)
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
              </SelectContent>
            </Select>
            <Select
              value={search.whatsapp ?? ALL}
              onValueChange={(v) =>
                setSearch({ whatsapp: v === ALL ? undefined : (v as LeadsSearch["whatsapp"]) })
              }
            >
              <SelectTrigger className="lg:w-44" aria-label="WhatsApp">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any WhatsApp</SelectItem>
                <SelectItem value="yes">On WhatsApp</SelectItem>
                <SelectItem value="no">Not on WhatsApp</SelectItem>
                <SelectItem value="unknown">Mobile, not tried yet</SelectItem>
                <SelectItem value="landline">Landline</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={search.sort ?? "newest"}
              onValueChange={(v) =>
                setSearch({ sort: v === "newest" ? undefined : (v as LeadSort) })
              }
            >
              <SelectTrigger className="lg:ml-auto lg:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
        {filtersActive && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5">
            {search.importId && (
              <Badge variant="secondary" className="gap-1">
                Import: {sourceImport?.filename ?? "selected import"}
                <button
                  onClick={() => setSearch({ importId: undefined })}
                  aria-label="Clear import filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {search.searchId && (
              <Badge variant="secondary" className="gap-1">
                Search: {sourceSearch?.name ?? "selected search"}
                <button
                  onClick={() => setSearch({ searchId: undefined })}
                  aria-label="Clear search filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setQInput("");
                void navigate({ search: {} });
              }}
            >
              Clear all filters
            </Button>
          </div>
        )}
      </Card>

      <EnrichBanner />

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <UserPlus className="h-4 w-4" /> Assign to…
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {staff
                  .filter((u) => u.active)
                  .map((u) => (
                    <DropdownMenuItem key={u.id} onClick={() => assign(u.id, u.name)}>
                      {u.name} <span className="text-xs text-muted-foreground">({u.role})</span>
                    </DropdownMenuItem>
                  ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    setDistributing({
                      ids: [...selected],
                      label: `${selected.size} selected leads`,
                    })
                  }
                >
                  <Shuffle className="h-4 w-4" /> Split between staff…
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => assign(null, null)}>Unassign</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {can("campaigns") && (
            <Button size="sm" onClick={() => emailLeads([...selected])}>
              <Send className="h-4 w-4" /> Email
            </Button>
          )}
          <Button size="sm" variant="outline" asChild>
            <Link to="/whatsapp" search={{ leadIds: [...selected].join(",") }}>
              <MessageCircle className="h-4 w-4 text-success" /> WhatsApp
            </Link>
          </Button>
          <Button size="sm" variant="outline" onClick={() => runEnrich({ ids: [...selected] })}>
            <Sparkles className="h-4 w-4" /> Check websites & ratings
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <ArrowRightLeft className="h-4 w-4" /> Move to stage
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {STAGES.map((s) => (
                <DropdownMenuItem
                  key={s.value}
                  onClick={() =>
                    bulkUpdate({ stage: s.value }, `${selected.size} leads moved to ${s.label}.`)
                  }
                >
                  <span className={`h-2 w-2 rounded-full ${s.dot}`} /> {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline">
                <Tag className="h-4 w-4" /> Tag
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 space-y-2">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const tag = bulkTag.trim();
                  if (tag)
                    void bulkUpdate({ addTags: [tag] }, `Tagged ${selected.size} leads “${tag}”.`);
                }}
              >
                <Input
                  value={bulkTag}
                  onChange={(e) => setBulkTag(e.target.value)}
                  placeholder="Tag name"
                  className="h-8"
                  autoFocus
                />
                <Button type="submit" size="sm" disabled={!bulkTag.trim()}>
                  Add
                </Button>
              </form>
              {!!facets?.tags.length && (
                <div className="flex flex-wrap gap-1">
                  {facets.tags.slice(0, 12).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        bulkUpdate({ addTags: [t] }, `Tagged ${selected.size} leads “${t}”.`)
                      }
                      className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium hover:bg-primary/10"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
          {can("export") && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={exporting}
                onClick={() => runExport("csv", [...selected])}
              >
                <FileText className="h-4 w-4" /> CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={exporting}
                onClick={() => runExport("xlsx", [...selected])}
              >
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </Button>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <Flag className="h-4 w-4" /> Priority / pin
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {PRIORITIES.map((p) => (
                <DropdownMenuItem
                  key={p.value}
                  onClick={() =>
                    bulkUpdate(
                      { priority: p.value },
                      `${selected.size} leads set to ${p.label} priority.`,
                    )
                  }
                >
                  <Flag className="h-4 w-4" /> {p.label} priority
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => bulkUpdate({ pinned: true }, `${selected.size} leads pinned.`)}
              >
                <Pin className="h-4 w-4" /> Pin to top
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => bulkUpdate({ pinned: false }, `${selected.size} leads unpinned.`)}
              >
                <PinOff className="h-4 w-4" /> Unpin
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {isAdmin && (
            <Button size="sm" variant="destructive" onClick={() => setPendingDelete([...selected])}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => setSelected(new Set())}
          >
            Clear selection
          </Button>
        </div>
      )}

      {/* Table */}
      <Card className="card-shadow rounded-xl py-0">
        <CardContent className="p-0">
          {isError ? (
            <EmptyState title="Could not load leads" description={error.message} />
          ) : isPending ? (
            <div className="flex justify-center py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : leads.length === 0 ? (
            <EmptyState
              icon={Users}
              title={filtersActive ? "No leads match these filters" : "No leads yet"}
              description={
                filtersActive
                  ? "Try removing a filter or searching for something else."
                  : isAdmin
                    ? "Run a search to start collecting business leads."
                    : "Your admin hasn't shared any leads with you yet."
              }
              action={
                !filtersActive &&
                isAdmin && (
                  <Button asChild>
                    <Link to="/find-leads">
                      <Search className="h-4 w-4" /> Find leads
                    </Link>
                  </Button>
                )
              }
            />
          ) : (
            <>
              {/* Phones: one card per lead. */}
              <ul className="divide-y divide-border md:hidden">
                {leads.map((l) => (
                  <li
                    key={l.id}
                    className={`flex gap-3 px-4 py-3 ${selected.has(l.id) ? "bg-muted/60" : ""}`}
                  >
                    <Checkbox
                      className="mt-1"
                      checked={selected.has(l.id)}
                      onCheckedChange={(v) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (v === true) next.add(l.id);
                          else next.delete(l.id);
                          return next;
                        })
                      }
                      aria-label={`Select ${l.businessName}`}
                    />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <Link to="/leads/$id" params={{ id: l.id }} className="min-w-0">
                          <p className="font-medium leading-snug text-foreground">
                            <PinnedMark pinned={l.pinned} /> {l.businessName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[l.category, l.city].filter(Boolean).join(" · ")}
                            {l.dealValue != null && (
                              <span className="ml-1.5 font-medium text-foreground">
                                {formatMoney(l.dealValue, settings.currency)}
                              </span>
                            )}
                          </p>
                        </Link>
                        <LeadActions
                          lead={l}
                          onDelete={isAdmin ? () => setPendingDelete([l.id]) : undefined}
                          onUpdate={(patch, msg) => void quickUpdate(l.id, patch, msg)}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StageBadge stage={l.stage} />
                        {l.priority !== "medium" && <PriorityBadge priority={l.priority} />}
                        <WhatsAppBadge lead={l} />
                        <OpportunityBadge lead={l} />
                        <RatingBadge rating={l.rating} reviews={l.reviewCount} />
                        {ownerName(l) && (
                          <span className="text-xs text-muted-foreground">· {ownerName(l)}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        {l.phone ? (
                          <a
                            href={`tel:${l.phone}`}
                            className="inline-flex items-center gap-1.5 py-1 text-primary"
                          >
                            <Phone className="h-3.5 w-3.5" /> {l.phone}
                          </a>
                        ) : (
                          <MissingBadge field="phone" />
                        )}
                        {l.email && (
                          <a
                            href={`mailto:${l.email}`}
                            className="inline-flex min-w-0 items-center gap-1.5 py-1 text-primary"
                          >
                            <Mail className="h-3.5 w-3.5 shrink-0" />{" "}
                            <span className="truncate">{l.email}</span>
                          </a>
                        )}
                        <WebsiteLink url={l.website} />
                      </div>
                      <WorkInfo lead={l} owner={null} showOwner={false} />
                      <TagChips tags={l.tags} />
                    </div>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 pl-4">
                        <Checkbox
                          checked={allOnPageSelected}
                          onCheckedChange={(v) =>
                            setSelected(v === true ? new Set(leads.map((l) => l.id)) : new Set())
                          }
                          aria-label="Select all on this page"
                        />
                      </TableHead>
                      <TableHead>Business</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead className="hidden md:table-cell">Working on it</TableHead>
                      <TableHead className="hidden md:table-cell">Location</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Website</TableHead>
                      <TableHead className="hidden 2xl:table-cell">Google profile</TableHead>
                      <TableHead
                        className="hidden lg:table-cell"
                        title="Opportunity for web & marketing services"
                      >
                        Opportunity
                      </TableHead>
                      <TableHead className="hidden xl:table-cell">Rating</TableHead>
                      <TableHead className="hidden xl:table-cell">Added</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((l) => (
                      <TableRow
                        key={l.id}
                        data-state={selected.has(l.id) ? "selected" : undefined}
                        className="cursor-pointer"
                        onClick={() => void navigate({ to: "/leads/$id", params: { id: l.id } })}
                      >
                        <TableCell
                          className={`pl-4 ${cellPad}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={selected.has(l.id)}
                            onCheckedChange={(v) =>
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (v === true) next.add(l.id);
                                else next.delete(l.id);
                                return next;
                              })
                            }
                            aria-label={`Select ${l.businessName}`}
                          />
                        </TableCell>
                        <TableCell className={cellPad}>
                          <p className="font-medium text-foreground">
                            <PinnedMark pinned={l.pinned} /> {l.businessName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {l.category}
                            {l.dealValue != null && (
                              <span className="ml-1.5 font-medium text-foreground">
                                {formatMoney(l.dealValue, settings.currency)}
                              </span>
                            )}
                          </p>
                          <TagChips tags={l.tags} />
                        </TableCell>
                        <TableCell className={cellPad}>
                          <StageBadge stage={l.stage} />
                          {l.priority !== "medium" && <PriorityBadge priority={l.priority} />}
                        </TableCell>
                        <TableCell className={`hidden max-w-56 md:table-cell ${cellPad}`}>
                          <WorkInfo lead={l} owner={ownerName(l)} />
                        </TableCell>
                        <TableCell
                          className={`hidden text-muted-foreground md:table-cell ${cellPad}`}
                        >
                          {[l.city, l.country].filter(Boolean).join(", ")}
                        </TableCell>
                        <TableCell
                          className={`whitespace-nowrap ${cellPad}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {l.phone ? (
                            <a href={`tel:${l.phone}`} className="hover:text-primary">
                              {l.phone}
                            </a>
                          ) : (
                            <MissingBadge field="phone" />
                          )}
                          <div className="mt-1">
                            <WhatsAppBadge lead={l} />
                          </div>
                        </TableCell>
                        <TableCell className={cellPad} onClick={(e) => e.stopPropagation()}>
                          {l.email ? (
                            <a href={`mailto:${l.email}`} className="hover:text-primary">
                              {l.email}
                            </a>
                          ) : (
                            <MissingBadge field="email" />
                          )}
                        </TableCell>
                        <TableCell className={cellPad} onClick={(e) => e.stopPropagation()}>
                          <WebsiteLink url={l.website} />
                        </TableCell>
                        <TableCell
                          className={`hidden 2xl:table-cell ${cellPad}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ProfileLink url={l.sourceUrl} />
                        </TableCell>
                        <TableCell className={`hidden lg:table-cell ${cellPad}`}>
                          <OpportunityBadge lead={l} />
                        </TableCell>
                        <TableCell className={`hidden xl:table-cell ${cellPad}`}>
                          <RatingBadge rating={l.rating} reviews={l.reviewCount} />
                        </TableCell>
                        <TableCell
                          className={`hidden whitespace-nowrap text-muted-foreground xl:table-cell ${cellPad}`}
                        >
                          {relativeTime(l.dateAdded)}
                        </TableCell>
                        <TableCell className={cellPad} onClick={(e) => e.stopPropagation()}>
                          <LeadActions
                            lead={l}
                            onDelete={isAdmin ? () => setPendingDelete([l.id]) : undefined}
                            onUpdate={(patch, msg) => void quickUpdate(l.id, patch, msg)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
        {total > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
            <span>
              {formatNumber((page - 1) * settings.rowsPerPage + 1)}–
              {formatNumber(Math.min(page * settings.rowsPerPage, total))} of {formatNumber(total)}
            </span>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline">
                Page {page} of {pageCount}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page <= 1}
                onClick={() => setSearch({ page: page - 1 > 1 ? page - 1 : undefined }, false)}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page >= pageCount}
                onClick={() => setSearch({ page: page + 1 }, false)}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <DistributeDialog
        target={distributing}
        onClose={() => {
          setDistributing(null);
          setSelected(new Set());
        }}
      />
      <LeadFormDialog
        open={adding}
        onOpenChange={setAdding}
        lead={null}
        onSaved={(lead) => void navigate({ to: "/leads/$id", params: { id: lead.id } })}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={
          pendingDelete && pendingDelete.length > 1
            ? `Delete ${pendingDelete.length} leads?`
            : "Delete this lead?"
        }
        description="Deleted leads are removed with their activity history and tasks. A future search may collect them again."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function leadSummary(l: Lead): string {
  return [
    l.businessName,
    l.category,
    l.address ?? [l.city, l.country].filter(Boolean).join(", "),
    l.phone,
    l.email,
    l.website,
    l.sourceUrl,
  ]
    .filter(Boolean)
    .join("\n");
}

function LeadActions({
  lead,
  onDelete,
  onUpdate,
}: {
  lead: Lead;
  onDelete?: (() => void) | undefined;
  onUpdate: (patch: LeadInput, success: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Lead actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link to="/leads/$id" params={{ id: lead.id }}>
            <ExternalLink className="h-4 w-4" /> Open lead
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => copyText(leadSummary(lead), "Lead details")}>
          <Copy className="h-4 w-4" /> Copy details
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            onUpdate(
              { pinned: !lead.pinned },
              lead.pinned ? "Unpinned." : `Pinned “${lead.businessName}” to the top.`,
            )
          }
        >
          {lead.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          {lead.pinned ? "Unpin" : "Pin to top"}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Flag className="h-4 w-4" /> Priority
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {PRIORITIES.map((p) => (
              <DropdownMenuItem
                key={p.value}
                disabled={p.value === lead.priority}
                onClick={() => onUpdate({ priority: p.value }, `Priority set to ${p.label}.`)}
              >
                {p.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {lead.sourceUrl && (
          <DropdownMenuItem asChild>
            <a href={lead.sourceUrl} target="_blank" rel="noreferrer">
              <MapPin className="h-4 w-4" /> Open Google Business Profile
            </a>
          </DropdownMenuItem>
        )}
        {onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
