import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Briefcase, Download, FileDown, Mail, Phone, Search, Table2 } from "lucide-react";
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
import { useAppState } from "@/hooks/useAppState";
import { MOCK_ACTIVITY } from "@/data/mockData";
import { formatDateTime, formatNumber, relativeTime } from "@/utils/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LeadFinder Pro — Dashboard" },
      { name: "description", content: "Overview of your business lead collection: totals, recent searches, and exports." },
      { property: "og:title", content: "LeadFinder Pro — Dashboard" },
      { property: "og:description", content: "Overview of your business lead collection: totals, recent searches, and exports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { leads, searches, exports } = useAppState();

  const withPhone = leads.filter((l) => l.phone).length;
  const withEmail = leads.filter((l) => l.email).length;
  const completedSearches = searches.filter((s) => s.status === "completed").length;
  const recentSearches = [...searches]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);
  const recentExports = [...exports]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 4);

  return (
    <div className="space-y-6">
      {/* Quick action */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-foreground">Welcome back</h2>
          <p className="text-sm text-muted-foreground">
            Here's what your lead collection looks like today.
          </p>
        </div>
        <Button asChild size="lg" className="shrink-0">
          <Link to="/find-leads">
            <Search className="h-4 w-4" />
            Find New Leads
          </Link>
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Leads" value={formatNumber(leads.length)} delta="+12% this week" icon={Briefcase} tone="primary" />
        <StatCard label="Leads with Phone Numbers" value={formatNumber(withPhone)} delta={`${Math.round((withPhone / leads.length) * 100)}% coverage`} icon={Phone} tone="success" />
        <StatCard label="Leads with Email Addresses" value={formatNumber(withEmail)} delta={`${Math.round((withEmail / leads.length) * 100)}% coverage`} icon={Mail} tone="warning" />
        <StatCard label="Completed Searches" value={formatNumber(completedSearches)} icon={Table2} tone="muted" />
      </div>

      {/* Chart */}
      <ActivityChart data={MOCK_ACTIVITY} />

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
                <Button asChild>
                  <Link to="/find-leads">
                    <Search className="h-4 w-4" /> Find New Leads
                  </Link>
                </Button>
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
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-muted-foreground">{s.niche}</TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {[s.city, s.country].filter(Boolean).join(", ")}
                      </TableCell>
                      <TableCell className="font-medium">{formatNumber(s.leadsFound)}</TableCell>
                      <TableCell><SearchStatusBadge status={s.status} /></TableCell>
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
