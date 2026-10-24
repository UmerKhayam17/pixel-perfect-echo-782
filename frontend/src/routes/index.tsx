import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlarmClock,
  ArrowRight,
  Briefcase,
  CircleDollarSign,
  Download,
  FileDown,
  Globe2,
  ListTodo,
  Loader2,
  Mail,
  Phone,
  Search,
  Table2,
  Trophy,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { ActivityChart } from "@/components/ActivityChart";
import { SearchStatusBadge } from "@/components/StatusBadge";
import { STAGES } from "@/components/CrmBadges";
import { TaskRow } from "@/components/Tasks";
import { Progress } from "@/components/ui/progress";
import {
  useAuth,
  useExports,
  useLeads,
  useSearches,
  useSettings,
  useStats,
  useTasks,
} from "@/hooks/queries";
import { OpportunityBadge, RatingBadge } from "@/components/LeadInsights";
import { formatDateTime, formatMoney, formatNumber, relativeTime } from "@/utils/format";
import type { ChartPoint } from "@/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LeadFinder Pro — Dashboard" },
      {
        name: "description",
        content: "Overview of your business lead collection: totals, recent searches, and exports.",
      },
      { property: "og:title", content: "LeadFinder Pro — Dashboard" },
      {
        property: "og:description",
        content: "Overview of your business lead collection: totals, recent searches, and exports.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

const coverage = (count: number, total: number) =>
  total ? `${Math.round((count / total) * 100)}% coverage` : "No leads yet";

function DashboardPage() {
  const { data: stats, isError, error } = useStats();
  const { data: searches = [] } = useSearches();
  const { data: exports = [] } = useExports();
  const { settings } = useSettings();
  const { data: openTasks = [] } = useTasks("open");
  const { user, isAdmin } = useAuth();

  const totalLeads = stats?.totalLeads ?? 0;
  const activity: ChartPoint[] = (stats?.activity ?? []).map((d) => ({
    date: new Date(`${d.day}T00:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    leads: d.leads,
    searches: d.searches,
  }));
  const running = searches.filter((s) => s.status === "running" || s.status === "paused");
  const recentSearches = searches.slice(0, 5);
  const recentExports = exports.slice(0, 4);
  const pipeline = stats?.pipeline ?? [];
  const openValue = pipeline
    .filter((p) => p.stage !== "won" && p.stage !== "lost")
    .reduce((n, p) => n + p.value, 0);
  const won = pipeline.find((p) => p.stage === "won");
  const maxStageCount = Math.max(1, ...pipeline.map((p) => p.count));
  const upNext = openTasks.slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Quick action */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-foreground">
            Welcome back, {user?.name.split(" ")[0] ?? settings.profileName}
          </h2>
          <p className="text-sm text-muted-foreground">
            Here's what your lead collection looks like today.
          </p>
        </div>
        {isAdmin ? (
          <Button asChild size="lg" className="shrink-0">
            <Link to="/find-leads">
              <Search className="h-4 w-4" />
              Find New Leads
            </Link>
          </Button>
        ) : (
          <Button asChild size="lg" className="shrink-0">
            <Link to="/leads">
              <Users className="h-4 w-4" />
              My leads
            </Link>
          </Button>
        )}
      </div>

      {isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error.message}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Total Leads"
          value={stats ? formatNumber(totalLeads) : "—"}
          delta={
            stats
              ? coverage(stats.withWebsite, totalLeads).replace("coverage", "with websites")
              : undefined
          }
          icon={Briefcase}
          tone="primary"
        />
        <StatCard
          label="Leads with Phone Numbers"
          value={stats ? formatNumber(stats.withPhone) : "—"}
          delta={stats ? coverage(stats.withPhone, totalLeads) : undefined}
          icon={Phone}
          tone="success"
        />
        <StatCard
          label="Leads with Email Addresses"
          value={stats ? formatNumber(stats.withEmail) : "—"}
          delta={stats ? coverage(stats.withEmail, totalLeads) : undefined}
          icon={Mail}
          tone="warning"
        />
        <StatCard
          label="Completed Searches"
          value={stats ? formatNumber(stats.searches.completed) : "—"}
          delta={stats ? `${formatNumber(stats.searches.total)} searches in total` : undefined}
          icon={Table2}
          tone="muted"
        />
      </div>

      {/* CRM summary */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Open pipeline"
          value={stats ? formatMoney(openValue, settings.currency) : "—"}
          delta={
            stats
              ? `${formatNumber(pipeline.filter((p) => p.stage !== "won" && p.stage !== "lost" && p.stage !== "new").reduce((n, p) => n + p.count, 0))} leads in progress`
              : undefined
          }
          icon={CircleDollarSign}
          tone="primary"
        />
        <StatCard
          label="Won"
          value={stats ? formatMoney(won?.value ?? 0, settings.currency) : "—"}
          delta={stats ? `${formatNumber(won?.count ?? 0)} deals closed` : undefined}
          icon={Trophy}
          tone="success"
        />
        <StatCard
          label="Due today"
          value={stats ? formatNumber(stats.tasks.dueToday) : "—"}
          delta={stats ? `${formatNumber(stats.tasks.open)} open tasks` : undefined}
          icon={ListTodo}
          tone="warning"
        />
        <StatCard
          label="Overdue follow-ups"
          value={stats ? formatNumber(stats.tasks.overdue) : "—"}
          icon={AlarmClock}
          tone={stats?.tasks.overdue ? "warning" : "muted"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="card-shadow rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="font-display text-base font-semibold">Pipeline</CardTitle>
              <CardDescription>Leads in each sales stage</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/pipeline">
                Board <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {STAGES.map((s) => {
                const row = pipeline.find((p) => p.stage === s.value);
                return (
                  <li key={s.value}>
                    <Link
                      to="/leads"
                      search={{ stage: s.value }}
                      className="block space-y-1 hover:text-primary"
                    >
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                          {s.label}
                        </span>
                        <span className="text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {formatNumber(row?.count ?? 0)}
                          </span>
                          {!!row?.value && ` · ${formatMoney(row.value, settings.currency)}`}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${s.dot}`}
                          style={{ width: `${((row?.count ?? 0) / maxStageCount) * 100}%` }}
                        />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <Card className="card-shadow rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="font-display text-base font-semibold">Up next</CardTitle>
              <CardDescription>Your earliest open follow-ups</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/tasks">
                All tasks <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {upNext.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No open tasks. Schedule follow-ups from a lead's page.
              </p>
            ) : (
              <ul className="-my-3 divide-y divide-border">
                {upNext.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <BestOpportunities />

      {/* Running searches */}
      {running.length > 0 && (
        <Card className="card-shadow rounded-xl border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display text-base font-semibold">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Running now
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {running.map((s) => (
              <Link
                key={s.id}
                to="/find-leads"
                search={{ searchId: s.id }}
                className="block space-y-1.5 rounded-lg p-2 -m-2 hover:bg-muted/60"
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{s.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {formatNumber(s.leadsFound)} leads · {Math.floor(s.progress ?? 0)}%
                  </span>
                </div>
                <Progress value={s.progress ?? 0} className="h-1.5" />
                <p className="truncate text-xs text-muted-foreground">{s.statusText}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* Chart */}
        <ActivityChart data={activity} />

        {/* Top countries */}
        <Card className="card-shadow rounded-xl">
          <CardHeader>
            <CardTitle className="font-display text-base font-semibold">Top countries</CardTitle>
            <CardDescription>Where your leads are</CardDescription>
          </CardHeader>
          <CardContent>
            {stats?.topCountries.length ? (
              <ul className="space-y-3">
                {stats.topCountries.map((c) => (
                  <li key={c.country}>
                    <Link
                      to="/leads"
                      search={{ country: c.country }}
                      className="block space-y-1 hover:text-primary"
                    >
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-1.5">
                          <Globe2 className="h-3.5 w-3.5 text-muted-foreground" />
                          {c.country}
                        </span>
                        <span className="font-medium">{formatNumber(c.count)}</span>
                      </div>
                      <Progress value={(c.count / totalLeads) * 100} className="h-1.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No leads yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent searches */}
      <Card className="card-shadow rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="font-display text-base font-semibold">Recent searches</CardTitle>
            <CardDescription>Your latest lead collection runs</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/search-history">
              View all
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentSearches.length === 0 ? (
            <EmptyState
              title="No searches yet"
              description="Start your first lead search to see results here."
              action={
                isAdmin ? (
                  <Button asChild>
                    <Link to="/find-leads">
                      <Search className="h-4 w-4" /> Find New Leads
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Search</TableHead>
                    <TableHead>Niche</TableHead>
                    <TableHead className="hidden md:table-cell">Location</TableHead>
                    <TableHead>Leads</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell text-right">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentSearches.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {isAdmin ? (
                          <Link
                            to="/find-leads"
                            search={{ searchId: s.id }}
                            className="hover:text-primary"
                          >
                            {s.name}
                          </Link>
                        ) : (
                          <Link
                            to="/leads"
                            search={{ searchId: s.id }}
                            className="hover:text-primary"
                          >
                            {s.name}
                          </Link>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{s.niche}</TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {[s.city, s.country].filter(Boolean).join(", ")}
                      </TableCell>
                      <TableCell className="font-medium">{formatNumber(s.leadsFound)}</TableCell>
                      <TableCell>
                        <SearchStatusBadge status={s.status} />
                      </TableCell>
                      <TableCell className="hidden text-right text-muted-foreground sm:table-cell">
                        {relativeTime(s.date)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent exports */}
      <Card className="card-shadow rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="font-display text-base font-semibold">Recent exports</CardTitle>
            <CardDescription>Files generated from your leads</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/export-center">
              Export Center
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentExports.length === 0 ? (
            <EmptyState
              icon={FileDown}
              title="No exports yet"
              description="Export your leads as CSV or Excel from the Export Center."
              action={
                <Button asChild variant="outline">
                  <Link to="/export-center">
                    <Download className="h-4 w-4" /> Go to Export Center
                  </Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {recentExports.map((e) => (
                <li key={e.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileDown className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{e.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.scope} · {formatNumber(e.count)} records · {formatDateTime(e.date)}
                    </p>
                  </div>
                  <span className="rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
                    {e.format.toUpperCase()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Top open leads by opportunity score, with the reasons, so the team knows who to contact first. */
function BestOpportunities() {
  const { data } = useLeads({
    sort: "opportunity",
    stage: ["new", "contacted", "qualified"],
    hideClosed: true,
    limit: 6,
    page: 1,
  });
  const leads = (data?.items ?? []).filter((l) => (l.opportunity ?? 0) > 0);
  if (!leads.length) return null;
  return (
    <Card className="card-shadow rounded-xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="font-display text-base font-semibold">Best opportunities</CardTitle>
          <CardDescription>
            Open leads most likely to need web & marketing help — contact these first
          </CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/leads" search={{ sort: "opportunity" }}>
            All <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {leads.map((l) => (
            <li key={l.id}>
              <Link
                to="/leads/$id"
                params={{ id: l.id }}
                className="block h-full rounded-lg border border-border p-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-snug">{l.businessName}</p>
                  <OpportunityBadge lead={l} />
                </div>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  {l.city}
                  <RatingBadge rating={l.rating} reviews={l.reviewCount} />
                </p>
                <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                  {(l.opportunityReasons ?? []).join(" · ")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
