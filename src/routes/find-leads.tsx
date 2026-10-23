import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Building2, CheckCircle2, CirclePause, CirclePlay, Globe, Loader2,
  Mail, MapPin, Phone, RotateCcw, Search, Square, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CountryCombobox } from "@/components/CountryCombobox";
import { useAppState } from "@/hooks/useAppState";
import { generateLeads } from "@/data/mockData";
import { NICHES } from "@/data/countries";
import { formatNumber } from "@/utils/format";
import type { ContactType, Lead, SearchRecord } from "@/types";

export const Route = createFileRoute("/find-leads")({
  validateSearch: (params: Record<string, string | undefined>) => ({
    niche: params.niche,
    country: params.country,
    city: params.city,
    keyword: params.keyword,
  }),
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
  component: FindLeadsPage,
});

type Phase = "form" | "progress";
type RunStatus = "running" | "paused" | "completed" | "cancelled";

interface RunState {
  status: RunStatus;
  progress: number;
  discovered: number;
  phones: number;
  emails: number;
  elapsed: number;
  statusText: string;
  preview: Lead[];
}

const STATUS_STEPS = [
  "Scanning public business directories…",
  "Extracting business listings…",
  "Parsing contact details…",
  "Validating records and removing duplicates…",
];

const MAX_STORED = 150;

function FindLeadsPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { settings, addLeads, addSearch, updateSearch } = useAppState();

  const [phase, setPhase] = useState<Phase>("form");
  const [niche, setNiche] = useState(search.niche ?? "");
  const [country, setCountry] = useState(search.country ?? settings.defaultCountry);
  const [city, setCity] = useState(search.city ?? "");
  const [keyword, setKeyword] = useState(search.keyword ?? "");
  const [maxResults, setMaxResults] = useState(String(settings.defaultResultLimit));
  const [wantPhone, setWantPhone] = useState(settings.defaultPhone);
  const [wantEmail, setWantEmail] = useState(settings.defaultEmail);
  const [wantWebsite, setWantWebsite] = useState(settings.defaultWebsite);
  const [onlyWithWebsites, setOnlyWithWebsites] = useState(settings.defaultOnlyWithWebsites);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [run, setRun] = useState<RunState | null>(null);
  const runRef = useRef<{
    id: string;
    candidates: Lead[];
    target: number;
    startedAt: number;
  } | null>(null);

  useEffect(() => {
    if (search.niche) setNiche(search.niche);
    if (search.country) setCountry(search.country);
    if (search.city) setCity(search.city);
    if (search.keyword) setKeyword(search.keyword);
  }, [search.niche, search.country, search.city, search.keyword]);

  const contactTypes: ContactType[] = useMemo(() => {
    const t: ContactType[] = [];
    if (wantPhone) t.push("phone");
    if (wantEmail) t.push("email");
    if (wantWebsite) t.push("website");
    return t;
  }, [wantPhone, wantEmail, wantWebsite]);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!niche.trim()) next.niche = "Please enter a business niche.";
    if (!country) next.country = "Please select a target country.";
    if (contactTypes.length === 0) next.contact = "Select at least one type of contact information.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function buildCandidates(): { candidates: Lead[]; target: number } {
    const requested = Number(maxResults);
    // Simulated yield: between 45% and 85% of the requested maximum.
    const yieldRate = 0.45 + ((requested * 7919) % 41) / 100;
    const target = Math.min(MAX_STORED, Math.max(6, Math.floor(requested * yieldRate)));
    let pool = generateLeads({
      niche: niche.trim(),
      country,
      city: city.trim() || null,
      keyword: keyword.trim() || null,
      count: Math.ceil(target * 1.6),
      seed: Math.floor(Math.random() * 100000),
    });
    if (onlyWithWebsites) pool = pool.filter((l) => l.website);
    pool = pool.slice(0, target).map((l) => ({
      ...l,
      phone: wantPhone ? l.phone : null,
      email: wantEmail ? l.email : null,
      website: wantWebsite ? l.website : null,
    }));
    return { candidates: pool, target: pool.length };
  }

  function startSearch() {
    if (!validate()) {
      toast.error("Please fix the highlighted fields before starting the search.");
      return;
    }
    const { candidates, target } = buildCandidates();
    const id = `search-${Date.now()}`;
    runRef.current = { id, candidates, target, startedAt: Date.now() };

    const record: SearchRecord = {
      id,
      name: `${niche.trim()} — ${country}${city.trim() ? ` (${city.trim()})` : ""}`,
      niche: niche.trim(),
      country,
      city: city.trim() || null,
      keyword: keyword.trim() || null,
      maxResults: Number(maxResults),
      contactTypes,
      onlyWithWebsites,
      date: new Date().toISOString(),
      leadsFound: 0,
      status: "running",
    };
    addSearch(record);

    setRun({
      status: "running",
      progress: 0,
      discovered: 0,
      phones: 0,
      emails: 0,
      elapsed: 0,
      statusText: STATUS_STEPS[0],
      preview: [],
    });
    setPhase("progress");
    toast.info("Search started (simulated) — no real network requests are made.");
  }

  useEffect(() => {
    if (phase !== "progress" || run?.status !== "running") return;
    const timer = window.setInterval(() => {
      setRun((prev) => {
        if (!prev || prev.status !== "running") return prev;
        const ctx = runRef.current;
        if (!ctx) return prev;
        const nextProgress = Math.min(100, prev.progress + 1.6 + Math.random() * 2.4);
        const discovered = Math.min(ctx.target, Math.floor((nextProgress / 100) * ctx.target));
        const discoveredLeads = ctx.candidates.slice(0, discovered);
        const stepIndex = Math.min(STATUS_STEPS.length - 1, Math.floor((nextProgress / 100) * STATUS_STEPS.length));
        if (nextProgress >= 100) finishSearch(discoveredLeads);
        return {
          status: nextProgress >= 100 ? "completed" : "running",
          progress: nextProgress,
          discovered,
          phones: discoveredLeads.filter((l) => l.phone).length,
          emails: discoveredLeads.filter((l) => l.email).length,
          elapsed: prev.elapsed + 0.3,
          statusText: nextProgress >= 100 ? "Search completed." : STATUS_STEPS[stepIndex],
          preview: discoveredLeads.slice(-8).reverse(),
        };
      });
    }, 300);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, run?.status]);

  function finishSearch(discoveredLeads: Lead[]) {
    const ctx = runRef.current;
    if (!ctx) return;
    const duration = Math.round((Date.now() - ctx.startedAt) / 1000);
    const added = addLeads(discoveredLeads);
    updateSearch(ctx.id, { status: "completed", leadsFound: added, durationSeconds: duration });
    toast.success(`${added} leads collected${added < discoveredLeads.length ? " (duplicates were skipped)" : ""}.`);
  }

  function togglePause() {
    setRun((prev) => {
      if (!prev) return prev;
      if (prev.status === "running") {
        toast.info("Search paused.");
        return { ...prev, status: "paused", statusText: "Paused — press Resume to continue." };
      }
      if (prev.status === "paused") {
        toast.info("Search resumed.");
        return { ...prev, status: "running" };
      }
      return prev;
    });
  }

  function cancelSearch() {
    const ctx = runRef.current;
    setRun((prev) => {
      if (!prev) return prev;
      const discoveredLeads = ctx ? ctx.candidates.slice(0, prev.discovered) : [];
      if (ctx) {
        const duration = Math.round((Date.now() - ctx.startedAt) / 1000);
        const added = addLeads(discoveredLeads);
        updateSearch(ctx.id, { status: "cancelled", leadsFound: added, durationSeconds: duration });
      }
      toast.warning("Search cancelled. Partial results were kept.");
      return {
        ...prev,
        status: "cancelled",
        statusText: "Search cancelled. Partial results below were kept.",
        preview: discoveredLeads.slice(-8).reverse(),
      };
    });
  }

  function resetToForm() {
    setPhase("form");
    setRun(null);
    runRef.current = null;
  }

  /* ------------------------------- Form view ------------------------------ */

  if (phase === "form") {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h2 className="font-display text-xl font-bold">New lead search</h2>
          <p className="text-sm text-muted-foreground">
            Describe the businesses you want to find. This prototype simulates the search —
            no real network requests are made.
          </p>
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
                aria-invalid={!!errors.niche}
              />
              <div className="flex flex-wrap gap-1.5">
                {NICHES.slice(0, 5).map((n) => (
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
              {errors.niche && <p className="text-xs text-destructive">{errors.niche}</p>}
            </div>

            {/* Country + City */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  Country <span className="text-destructive">*</span>
                </Label>
                <CountryCombobox value={country} onChange={setCountry} />
                {errors.country && <p className="text-xs text-destructive">{errors.country}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">City or region <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  id="city"
                  placeholder="e.g. London, Dubai, Austin"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
            </div>

            {/* Keyword + Max results */}
            <div className="grid gap-4 sm:grid-cols-2">
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
                    {["100", "500", "1000", "5000"].map((v) => (
                      <SelectItem key={v} value={v}>
                        {formatNumber(Number(v))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Contact options */}
            <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
              <Label className="text-sm font-semibold">Contact information to collect</Label>
              <div className="grid gap-3 sm:grid-cols-3">
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
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={wantWebsite} onCheckedChange={(v) => setWantWebsite(v === true)} />
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  Business websites
                </label>
              </div>
              {errors.contact && <p className="text-xs text-destructive">{errors.contact}</p>}
              <div className="flex items-center justify-between border-t border-border pt-3">
                <div>
                  <p className="text-sm font-medium">Include only businesses with websites</p>
                  <p className="text-xs text-muted-foreground">Skips listings where no website was found.</p>
                </div>
                <Switch checked={onlyWithWebsites} onCheckedChange={setOnlyWithWebsites} />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button size="lg" onClick={startSearch}>
                <Search className="h-4 w-4" />
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

  const ctx = runRef.current;
  const runRecord: SearchRecord | undefined = ctx
    ? {
        id: ctx.id,
        name: `${niche.trim()} — ${country}${city.trim() ? ` (${city.trim()})` : ""}`,
        niche: niche.trim(),
        country,
        city: city.trim() || null,
        keyword: keyword.trim() || null,
        maxResults: Number(maxResults),
        contactTypes,
        onlyWithWebsites,
        date: new Date(ctx.startedAt).toISOString(),
        leadsFound: run?.discovered ?? 0,
        status: run?.status ?? "running",
      }
    : undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
        <CirclePlay className="mt-0.5 h-5 w-5 shrink-0 text-warning-foreground" />
        <div className="text-sm">
          <p className="font-semibold text-warning-foreground">Simulated progress</p>
          <p className="text-warning-foreground/80">
            This screen demonstrates the search workflow with mock data — no live network requests or real
            businesses are involved.
          </p>
        </div>
      </div>

      <Card className="card-shadow rounded-xl">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="font-display text-base font-semibold">{runRecord?.name}</CardTitle>
              <CardDescription>
                {run?.status === "completed"
                  ? `Completed in ${Math.round(run.elapsed)}s · ${formatNumber(run.discovered)} leads`
                  : run?.status === "cancelled"
                    ? "Cancelled — partial results kept"
                    : `Running for ${Math.round(run?.elapsed ?? 0)}s`}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {run?.status === "running" && (
                <Button variant="outline" onClick={togglePause}>
                  <CirclePause className="h-4 w-4" /> Pause
                </Button>
              )}
              {run?.status === "paused" && (
                <Button variant="outline" onClick={togglePause}>
                  <CirclePlay className="h-4 w-4" /> Resume
                </Button>
              )}
              {(run?.status === "running" || run?.status === "paused") && (
                <Button variant="destructive" onClick={cancelSearch}>
                  <Square className="h-4 w-4" /> Cancel
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                {run?.status === "running" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                {run?.status === "completed" && <CheckCircle2 className="h-4 w-4 text-success" />}
                {run?.statusText}
              </span>
              <span className="font-semibold text-foreground">{Math.floor(run?.progress ?? 0)}%</span>
            </div>
            <Progress value={run?.progress ?? 0} className="h-2.5" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: "Businesses discovered", value: run?.discovered ?? 0, icon: Building2 },
              { label: "Phone numbers found", value: run?.phones ?? 0, icon: Phone },
              { label: "Email addresses found", value: run?.emails ?? 0, icon: Mail },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <s.icon className="h-4 w-4" />
                  {s.label}
                </div>
                <p className="mt-1 font-display text-2xl font-bold">{formatNumber(s.value)}</p>
              </div>
            ))}
          </div>

          {run?.status === "completed" && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-success/30 bg-success/10 p-4">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <p className="text-sm font-medium text-success-foreground">
                Search finished — collected leads were added to All Leads.
              </p>
              <div className="ml-auto flex gap-2">
                <Button asChild size="sm">
                  <Link to="/leads">View all leads</Link>
                </Button>
                <Button variant="outline" size="sm" onClick={resetToForm}>
                  <RotateCcw className="h-4 w-4" /> New search
                </Button>
              </div>
            </div>
          )}

          {(run?.status === "cancelled") && (
            <Button variant="outline" size="sm" onClick={resetToForm}>
              <RotateCcw className="h-4 w-4" /> Start a new search
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="card-shadow rounded-xl">
        <CardHeader>
          <CardTitle className="font-display text-base font-semibold">Results preview</CardTitle>
          <CardDescription>
            Latest records as they are discovered. Full results land in All Leads when the run completes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {run && run.preview.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Business Name</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {run.preview.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.businessName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {l.city}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{l.phone ?? <X className="h-4 w-4 text-destructive/60" />}</TableCell>
                      <TableCell className="text-muted-foreground">{l.email ?? <X className="h-4 w-4 text-destructive/60" />}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Waiting for the first results…
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
