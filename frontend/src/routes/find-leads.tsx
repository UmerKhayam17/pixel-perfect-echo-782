import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Building2, CheckCircle2, CirclePause, CirclePlay, Globe, Loader2,
  Mail, Phone, RotateCcw, Search, Square, TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CountryCombobox } from "@/components/CountryCombobox";
import { SourceBadge } from "@/components/SourceBadge";
import { LeadResultsTable } from "@/components/LeadResultsTable";
import { useInvalidateData, useSettings, useUsers } from "@/hooks/queries";
import { ApiError, api } from "@/lib/api";
import { NICHES, countryByName } from "@/data/countries";
import { formatDuration, formatNumber } from "@/utils/format";
import type { ContactType, SearchRecord, SearchStatus, WebsiteFilter } from "@/types";
import { AdminOnly } from "@/components/AdminOnly";

interface FindLeadsSearch {
  niche?: string | undefined;
  country?: string | undefined;
  city?: string | undefined;
  keyword?: string | undefined;
  maxResults?: number | undefined;
  contactTypes?: string | undefined;
  websiteFilter?: WebsiteFilter | undefined;
  searchId?: string | undefined;
}

export const Route = createFileRoute("/find-leads")({
  validateSearch: (params: Record<string, unknown>): FindLeadsSearch => {
    const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
    const num = Number(params["maxResults"]);
    return {
      niche: str(params["niche"]),
      country: str(params["country"]),
      city: str(params["city"]),
      keyword: str(params["keyword"]),
      maxResults: Number.isFinite(num) && num > 0 ? num : undefined,
      contactTypes: str(params["contactTypes"]),
      websiteFilter: WEBSITE_OPTIONS.some((o) => o.value === params["websiteFilter"])
        ? (params["websiteFilter"] as WebsiteFilter)
        : // Old "Run again" links used ?onlyWithWebsites=true.
          params["onlyWithWebsites"] === true || params["onlyWithWebsites"] === "true"
          ? "with"
          : undefined,
      searchId: str(params["searchId"]),
    };
  },
  head: () => ({
    meta: [
      { title: "Find Leads — LeadFinder Pro" },
      { name: "description", content: "Configure and run a business lead search by niche, country, and city." },
      { property: "og:title", content: "Find Leads — LeadFinder Pro" },
      { property: "og:description", content: "Configure and run a business lead search by niche, country, and city." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AdminOnly>
      <FindLeadsPage />
    </AdminOnly>
  ),
});

const WEBSITE_OPTIONS: { value: WebsiteFilter; label: string; description: string }[] = [
  { value: "any", label: "All businesses", description: "With or without a website." },
  { value: "with", label: "Has a website", description: "Skip listings with no website." },
  { value: "without", label: "No website", description: "Only listings with no website, e.g. web design prospects." },
];

const POLL_MS = 1500;
const ACTIVE_STATUSES: SearchStatus[] = ["running", "paused"];
const RESULT_LIMITS = [20, 50, 100, 250, 500, 1000, 2000, 5000];

function FindLeadsPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { settings, isSuccess: settingsLoaded } = useSettings();
  const invalidateData = useInvalidateData();
  const qc = useQueryClient();

  const [niche, setNiche] = useState(search.niche ?? "");
  const [country, setCountry] = useState(search.country ?? settings.defaultCountry);
  const [city, setCity] = useState(search.city ?? "");
  const [keyword, setKeyword] = useState(search.keyword ?? "");
  const [maxResults, setMaxResults] = useState(String(search.maxResults ?? settings.defaultResultLimit));
  const [wantPhone, setWantPhone] = useState(settings.defaultPhone);
  const [wantEmail, setWantEmail] = useState(settings.defaultEmail);
  const [websiteFilter, setWebsiteFilter] = useState<WebsiteFilter>(search.websiteFilter ?? settings.defaultWebsiteFilter);
  const { data: users = [] } = useUsers();
  const staff = users.filter((u) => u.active && u.role === "member");
  const [autoAssign, setAutoAssign] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [run, setRun] = useState<SearchRecord | null>(null);
  const foundRef = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  const finishedRef = useRef<string | null>(null);

  // Apply saved defaults once they load, unless the URL (e.g. "Run again") already set a value.
  useEffect(() => {
    if (!settingsLoaded) return;
    if (!search.country) setCountry(settings.defaultCountry);
    if (!search.maxResults) setMaxResults(String(settings.defaultResultLimit));
    if (!search.contactTypes) {
      setWantPhone(settings.defaultPhone);
      setWantEmail(settings.defaultEmail);
    }
    if (search.websiteFilter === undefined) setWebsiteFilter(settings.defaultWebsiteFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded]);

  useEffect(() => {
    if (search.niche) setNiche(search.niche);
    if (search.country) setCountry(search.country);
    if (search.city) setCity(search.city);
    if (search.keyword) setKeyword(search.keyword);
    if (search.maxResults) setMaxResults(String(search.maxResults));
    if (search.contactTypes) {
      const types = search.contactTypes.split(",");
      setWantPhone(types.includes("phone"));
      setWantEmail(types.includes("email"));
    }
    if (search.websiteFilter !== undefined) setWebsiteFilter(search.websiteFilter);
  }, [search.niche, search.country, search.city, search.keyword, search.maxResults, search.contactTypes, search.websiteFilter]);

  // Re-open the progress view of an existing search (links from the sidebar and Search History).
  useEffect(() => {
    if (!search.searchId || run?.id === search.searchId) return;
    let cancelled = false;
    api
      .getSearch(search.searchId)
      .then(({ search: found }) => {
        if (cancelled) return;
        finishedRef.current = ACTIVE_STATUSES.includes(found.status) ? null : found.id;
        setRun(found);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Search not found.");
        void navigate({ to: "/find-leads", search: {} });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.searchId]);

  const contactTypes: ContactType[] = useMemo(() => {
    const t: ContactType[] = [];
    if (wantPhone) t.push("phone");
    if (wantEmail) t.push("email");
    t.push("website");
    return t;
  }, [wantPhone, wantEmail]);

  const limitOptions = useMemo(() => {
    const current = Number(maxResults);
    return RESULT_LIMITS.includes(current) || !current ? RESULT_LIMITS : [...RESULT_LIMITS, current].sort((a, b) => a - b);
  }, [maxResults]);

  const citySuggestions = countryByName(country)?.cities ?? [];

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!niche.trim()) next["niche"] = "Please enter a business niche.";
    if (!country) next["country"] = "Please select a target country.";
    if (contactTypes.length === 0) next["contact"] = "Select at least one type of contact information.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function startSearch() {
    if (!validate()) {
      toast.error("Please fix the highlighted fields before starting the search.");
      return;
    }
    setSubmitting(true);
    try {
      const started = await api.startSearch({
        niche: niche.trim(),
        country,
        city: city.trim() || null,
        keyword: keyword.trim() || null,
        maxResults: Number(maxResults),
        contactTypes,
        websiteFilter,
        autoDistributeTo: [...autoAssign],
      });
      finishedRef.current = null;
      setRun(started);
      void invalidateData();
      void navigate({ to: "/find-leads", search: { searchId: started.id }, replace: true });
      toast.info("Search started — collecting live business listings.");
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      toast.error(err instanceof Error ? err.message : "Could not start the search.");
    } finally {
      setSubmitting(false);
    }
  }

  const runId = run?.id;
  const runActive = !!run && ACTIVE_STATUSES.includes(run.status);

  useEffect(() => {
    if (!runId || !runActive) return;
    let stopped = false;
    const tick = async () => {
      try {
        const { search: latest } = await api.getSearch(runId);
        if (stopped) return;
        setRun(latest);
        // Refresh the results table whenever the scraper reports more businesses.
        const found = latest.leadsFound + (latest.duplicatesSkipped ?? 0);
        if (found !== foundRef.current) {
          foundRef.current = found;
          void qc.invalidateQueries({ queryKey: ["leads"] });
        }
        if (!ACTIVE_STATUSES.includes(latest.status)) finishSearch(latest);
      } catch {
        /* transient network error — retry on the next tick */
      }
    };
    void tick();
    const poll = window.setInterval(tick, POLL_MS);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stopped = true;
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, runActive]);

  function finishSearch(finished: SearchRecord) {
    if (finishedRef.current === finished.id) return;
    finishedRef.current = finished.id;
    void invalidateData();
    const skipped = finished.duplicatesSkipped ?? 0;
    if (finished.status === "completed") {
      toast.success(
        `${finished.leadsFound} leads collected${skipped ? ` (${skipped} duplicates were skipped)` : ""}.`,
      );
    } else if (finished.status === "cancelled") {
      toast.warning("Search cancelled. Partial results were kept.");
    } else if (finished.status === "failed") {
      toast.error(finished.error ?? "The search failed.");
    }
  }

  async function togglePause() {
    if (!run) return;
    try {
      if (run.status === "running") {
        setRun(await api.pauseSearch(run.id));
        toast.info("Search paused.");
      } else if (run.status === "paused") {
        setRun(await api.resumeSearch(run.id));
        toast.info("Search resumed.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the search.");
    }
  }

  async function cancelSearch() {
    if (!run) return;
    try {
      await api.cancelSearch(run.id);
      // The final "cancelled" status arrives through polling once the scraper has stopped.
      setRun((prev) => (prev ? { ...prev, status: "running", statusText: "Cancelling…" } : prev));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel the search.");
    }
  }

  function resetToForm() {
    setRun(null);
    void navigate({ to: "/find-leads", search: {} });
  }

  /* ------------------------------- Form view ------------------------------ */

  if (!run) {
    if (search.searchId) {
      return (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold">New lead search</h2>
            <p className="text-sm text-muted-foreground">
              Describe the businesses you want to find. Listings are collected live and each website
              is checked for a public email address.
            </p>
          </div>
          <SourceBadge />
        </div>

        <Card className="card-shadow rounded-xl">
          <CardHeader>
            <CardTitle className="font-display text-base font-semibold">Business search</CardTitle>
            <CardDescription>All fields marked required must be filled before starting.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Niche */}
            <div className="space-y-2">
              <Label htmlFor="niche">
                Business niche <span className="text-destructive">*</span>
              </Label>
              <Input
                id="niche"
                placeholder="e.g. Dental Clinics, Real Estate Agencies, Restaurants, IT Companies"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                aria-invalid={!!errors["niche"]}
              />
              <div className="flex flex-wrap gap-1.5">
                {NICHES.slice(0, 6).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNiche(n)}
                    className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {n}
                  </button>
                ))}
              </div>
              {errors["niche"] && <p className="text-xs text-destructive">{errors["niche"]}</p>}
            </div>

            {/* Country + City */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  Country <span className="text-destructive">*</span>
                </Label>
                <CountryCombobox value={country} onChange={setCountry} />
                {errors["country"] && <p className="text-xs text-destructive">{errors["country"]}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">City or region <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  id="city"
                  list="city-suggestions"
                  placeholder={citySuggestions.length ? `e.g. ${citySuggestions.slice(0, 3).join(", ")}` : "e.g. London, Dubai, Austin"}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
                <datalist id="city-suggestions">
                  {citySuggestions.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Keyword + Max results */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="keyword">Keyword <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  id="keyword"
                  placeholder="e.g. luxury, family, emergency"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Maximum results</Label>
                <Select value={maxResults} onValueChange={setMaxResults}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {limitOptions.map((v) => (
                      <SelectItem key={v} value={String(v)}>
                        {formatNumber(v)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Roughly 2–3 seconds per business with the Maps scraper.
                </p>
              </div>
            </div>

            {/* Contact options */}
            <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
              <Label className="text-sm font-semibold">Contact information to collect</Label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={wantPhone} onCheckedChange={(v) => setWantPhone(v === true)} />
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  Business phone numbers
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={wantEmail} onCheckedChange={(v) => setWantEmail(v === true)} />
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Public business emails
                </label>
                <label className="flex items-center gap-2 text-sm" title="Websites and Google Business Profile links are always saved">
                  <Checkbox checked disabled />
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  Websites &amp; Google profile <span className="text-xs text-muted-foreground">(always)</span>
                </label>
              </div>
              {errors["contact"] && <p className="text-xs text-destructive">{errors["contact"]}</p>}
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-sm font-medium">Website</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {WEBSITE_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setWebsiteFilter(o.value)}
                      aria-pressed={websiteFilter === o.value}
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        websiteFilter === o.value
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border bg-card hover:bg-muted"
                      }`}
                    >
                      <span className="block text-sm font-medium">{o.label}</span>
                      <span className="block text-xs text-muted-foreground">{o.description}</span>
                    </button>
                  ))}
                </div>
                {websiteFilter === "without" && wantEmail && (
                  <p className="text-xs text-muted-foreground">
                    Emails are found on business websites, so these leads will mostly have a phone number and Google profile only.
                  </p>
                )}
                {websiteFilter !== "any" && (
                  <p className="text-xs text-muted-foreground">
                    Filtered searches keep reading listings until enough match, so they take longer.
                  </p>
                )}
              </div>
            </div>

            {/* Auto-assignment */}
            {staff.length > 0 && (
              <div className="space-y-2 rounded-lg border border-border p-4">
                <p className="text-sm font-semibold">Assign new leads automatically</p>
                <p className="text-xs text-muted-foreground">
                  Each new business is handed to the next person in turn as it's found. They get a notification when the search finishes.
                  Leave everyone unticked to keep the leads unassigned.
                </p>
                <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
                  {staff.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={autoAssign.has(u.id)}
                        onCheckedChange={(v) =>
                          setAutoAssign((s) => {
                            const next = new Set(s);
                            if (v === true) next.add(u.id);
                            else next.delete(u.id);
                            return next;
                          })
                        }
                      />
                      {u.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button size="lg" onClick={startSearch} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Start Search
              </Button>
              <Button variant="ghost" onClick={() => navigate({ to: "/" })}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ---------------------------- Progress view ----------------------------- */

  const status = run.status;
  const elapsed = run.durationSeconds ?? Math.max(0, Math.round((now - new Date(run.date).getTime()) / 1000));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Card className="card-shadow rounded-xl">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="font-display text-base font-semibold">{run.name}</CardTitle>
              <CardDescription>
                {status === "completed"
                  ? `Completed in ${formatDuration(elapsed)} · ${formatNumber(run.leadsFound + (run.duplicatesSkipped ?? 0))} businesses found`
                  : status === "cancelled"
                    ? "Cancelled — partial results kept"
                    : status === "failed"
                      ? "Failed"
                      : `Running for ${formatDuration(elapsed)}`}
                {run.source ? ` · Source: ${run.source}` : ""}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {status === "running" && (
                <Button variant="outline" onClick={togglePause}>
                  <CirclePause className="h-4 w-4" /> Pause
                </Button>
              )}
              {status === "paused" && (
                <Button variant="outline" onClick={togglePause}>
                  <CirclePlay className="h-4 w-4" /> Resume
                </Button>
              )}
              {(status === "running" || status === "paused") && (
                <Button variant="destructive" onClick={cancelSearch}>
                  <Square className="h-4 w-4" /> Cancel
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                {status === "running" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
                {status === "completed" && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />}
                {status === "failed" && <TriangleAlert className="h-4 w-4 shrink-0 text-destructive" />}
                <span className="truncate">{run.statusText}</span>
              </span>
              <span className="font-semibold text-foreground">{Math.floor(run.progress ?? 0)}%</span>
            </div>
            <Progress value={run.progress ?? 0} className="h-2.5" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              {
                label: "Businesses found",
                value: run.leadsFound + (run.duplicatesSkipped ?? 0),
                icon: Building2,
                note: run.duplicatesSkipped ? `${formatNumber(run.leadsFound)} new · ${formatNumber(run.duplicatesSkipped)} already saved` : undefined,
              },
              { label: "Phone numbers found", value: run.phonesFound ?? 0, icon: Phone },
              { label: "Email addresses found", value: run.emailsFound ?? 0, icon: Mail },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <s.icon className="h-4 w-4" />
                  {s.label}
                </div>
                <p className="mt-1 font-display text-2xl font-bold">{formatNumber(s.value)}</p>
                {"note" in s && s.note && <p className="text-xs text-muted-foreground">{s.note}</p>}
              </div>
            ))}
          </div>

          {status === "completed" && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-success/30 bg-success/10 p-4">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <p className="text-sm font-medium text-foreground">
                Search finished — collected leads were added to All Leads.
              </p>
              <div className="ml-auto flex gap-2">
                <Button asChild size="sm">
                  <Link to="/leads" search={{ searchId: run.id }}>View these leads</Link>
                </Button>
                <Button variant="outline" size="sm" onClick={resetToForm}>
                  <RotateCcw className="h-4 w-4" /> New search
                </Button>
              </div>
            </div>
          )}

          {status === "failed" && (
            <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-destructive">{run.error ?? "The scraper stopped unexpectedly."}</p>
              <Button variant="outline" size="sm" onClick={resetToForm}>
                <RotateCcw className="h-4 w-4" /> Start a new search
              </Button>
            </div>
          )}

          {status === "cancelled" && (
            <div className="flex flex-wrap gap-2">
              {run.leadsFound > 0 && (
                <Button asChild size="sm">
                  <Link to="/leads" search={{ searchId: run.id }}>View collected leads</Link>
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={resetToForm}>
                <RotateCcw className="h-4 w-4" /> Start a new search
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="card-shadow rounded-xl">
        <CardHeader>
          <CardTitle className="font-display text-base font-semibold">Results</CardTitle>
          <CardDescription>
            Every business this search has found{runActive ? " — the list updates while the search runs" : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LeadResultsTable searchId={run.id} scope={run.name} live={runActive} />
        </CardContent>
      </Card>
    </div>
  );
}
