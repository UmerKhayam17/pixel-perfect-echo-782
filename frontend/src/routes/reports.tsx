import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CheckCircle2,
  CircleDollarSign,
  Download,
  Loader2,
  Mail,
  MessageSquareReply,
  Percent,
  Send,
  Trophy,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/StatCard";
import { STAGES } from "@/components/CrmBadges";
import { useAuth, useSearches, useSettings, useUsers } from "@/hooks/queries";
import { api } from "@/lib/api";
import { formatMoney, formatNumber } from "@/utils/format";
import type { ReportData } from "@/types";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — LeadFinder Pro" },
      {
        name: "description",
        content: "Leads, outreach, deals won and team performance over time.",
      },
    ],
  }),
  component: ReportsPage,
});

type Range = "7d" | "30d" | "90d" | "month" | "year";
const RANGES: { value: Range; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
];

function rangeDates(range: Range) {
  const end = new Date();
  end.setHours(24, 0, 0, 0);
  const start = new Date(end);
  if (range === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else if (range === "year") {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(start.getDate() - { "7d": 7, "30d": 30, "90d": 90 }[range]);
  }
  return { from: start.toISOString(), to: end.toISOString() };
}

// Series colors follow the entity, in the validated order (blue, green, violet, amber).
const OUTREACH = [
  { key: "call", label: "Calls", color: "var(--color-chart-1)" },
  { key: "whatsapp", label: "WhatsApp", color: "var(--color-chart-2)" },
  { key: "email", label: "Emails", color: "var(--color-chart-4)" },
  { key: "meeting", label: "Meetings", color: "var(--color-chart-3)" },
] as const;
const TREND = [
  { key: "newLeads", label: "New leads", color: "var(--color-chart-1)" },
  { key: "contacted", label: "Leads contacted", color: "var(--color-chart-2)" },
] as const;

const ALL = "__all__";
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
const axisTick = { fill: "var(--color-muted-foreground)", fontSize: 12 };
const compact = (v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}K` : String(v));
const tooltipStyle = {
  contentStyle: {
    background: "var(--color-popover)",
    border: "1px solid var(--color-border)",
    borderRadius: 10,
    fontSize: 13,
    color: "var(--color-popover-foreground)",
  },
  labelStyle: { color: "var(--color-muted-foreground)" },
};

function csv(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const text = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ReportsPage() {
  const { isAdmin } = useAuth();
  const { settings } = useSettings();
  const { data: searches = [] } = useSearches();
  const { data: users = [] } = useUsers(isAdmin);
  const [range, setRange] = useState<Range>("30d");
  const [searchId, setSearchId] = useState(ALL);
  const [userId, setUserId] = useState(ALL);
  const { from, to } = useMemo(() => rangeDates(range), [range]);
  const money = (n: number) => formatMoney(n, settings.currency);

  const query = useQuery({
    queryKey: ["reports", from, to, searchId, userId],
    queryFn: () =>
      api.reports({
        from,
        to,
        tzOffset: new Date().getTimezoneOffset(),
        ...(searchId !== ALL ? { searchId } : {}),
        ...(userId !== ALL ? { userId } : {}),
      }),
  });
  const data = query.data;
  const person = users.find((u) => u.id === userId)?.name;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold">
            {isAdmin ? "Reports" : "My performance"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? person
                ? `${person}'s work and leads`
                : "The whole team's leads, outreach and results"
              : "Your outreach and results on your leads"}
          </p>
        </div>
        {/* Filters: one row above the charts. */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={range} onValueChange={(v) => setRange(v as Range)}>
            <SelectTrigger className="w-full sm:hidden" aria-label="Date range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tabs
            value={range}
            onValueChange={(v) => setRange(v as Range)}
            className="hidden sm:block"
          >
            <TabsList>
              {RANGES.map((r) => (
                <TabsTrigger key={r.value} value={r.value}>
                  {r.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Select value={searchId} onValueChange={setSearchId}>
            <SelectTrigger className="min-w-0 flex-1 sm:w-48 sm:flex-none" aria-label="Campaign">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All campaigns</SelectItem>
              {searches.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isAdmin && (
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger
                className="min-w-0 flex-1 sm:w-40 sm:flex-none"
                aria-label="Staff member"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Everyone</SelectItem>
                {users
                  .filter((u) => u.active)
                  .map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
          {query.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </div>

      {query.isError ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {query.error.message}
        </p>
      ) : !data ? (
        <div className="flex justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard
              label="New leads"
              value={formatNumber(data.kpis.newLeads)}
              icon={Users}
              tone="primary"
            />
            <StatCard
              label="Leads contacted"
              value={formatNumber(data.kpis.contacted)}
              delta={`${formatNumber(data.kpis.outreach)} calls, emails & messages`}
              icon={Send}
              tone="success"
            />
            <StatCard
              label="Deals won"
              value={formatNumber(data.kpis.won)}
              delta={data.kpis.wonValue ? money(data.kpis.wonValue) : undefined}
              icon={Trophy}
              tone="warning"
            />
            <StatCard
              label="Win rate"
              value={data.kpis.winRate == null ? "—" : `${Math.round(data.kpis.winRate * 100)}%`}
              delta={`${formatNumber(data.kpis.won)} won · ${formatNumber(data.kpis.lost)} lost`}
              icon={Percent}
              tone="muted"
            />
            <StatCard
              label="Open pipeline"
              value={money(data.kpis.openValue)}
              delta={`${formatNumber(data.kpis.openLeads)} open leads`}
              icon={CircleDollarSign}
              tone="primary"
            />
            <StatCard
              label="Email replies"
              value={formatNumber(data.kpis.replies)}
              icon={MessageSquareReply}
              tone="success"
            />
            <StatCard
              label="Tasks completed"
              value={formatNumber(data.kpis.tasksDone)}
              icon={CheckCircle2}
              tone="muted"
            />
            <StatCard
              label="Contact rate"
              value={pct(data.kpis.contacted, data.kpis.newLeads)}
              delta="of new leads reached"
              icon={Mail}
              tone="muted"
            />
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <TrendChart data={data} />
            <OutreachChart data={data} />
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <FunnelChart data={data} />
            <EmailCampaigns data={data} />
          </div>

          {data.team && <TeamTable data={data} money={money} />}
          <CampaignTable data={data} money={money} />
        </>
      )}
    </div>
  );
}

/** Recharts needs a measured DOM; render only in the browser. */
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

const bucketLabel = (key: string, weekly: boolean) =>
  (weekly ? "Wk of " : "") +
  new Date(`${key}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-xs text-muted-foreground">View as table</summary>
      <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              {head.map((h) => (
                <TableHead key={h} className="h-8 text-xs">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                {r.map((c, j) => (
                  <TableCell key={j} className="py-1.5 text-xs tabular-nums">
                    {c}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </details>
  );
}

function TrendChart({ data }: { data: ReportData }) {
  const mounted = useMounted();
  const rows = data.series.map((s) => ({ ...s, label: bucketLabel(s.key, data.weekly) }));
  return (
    <Card className="card-shadow rounded-xl">
      <CardHeader>
        <CardTitle className="font-display text-base font-semibold">Leads over time</CardTitle>
        <CardDescription>
          New leads added and leads contacted, per {data.weekly ? "week" : "day"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          {mounted && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 16, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={axisTick}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={axisTick}
                  width={48}
                  allowDecimals={false}
                  tickFormatter={compact}
                />
                <Tooltip
                  {...tooltipStyle}
                  cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }}
                />
                <Legend
                  iconType="plainline"
                  wrapperStyle={{ fontSize: 12, color: "var(--color-muted-foreground)" }}
                />
                {TREND.map((t) => (
                  <Line
                    key={t.key}
                    type="monotone"
                    dataKey={t.key}
                    name={t.label}
                    stroke={t.color}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={false}
                    activeDot={{ r: 5, stroke: "var(--color-card)", strokeWidth: 2 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <DataTable
          head={[data.weekly ? "Week of" : "Day", "New leads", "Contacted", "Won"]}
          rows={rows.map((r) => [r.label, r.newLeads, r.contacted, r.won])}
        />
      </CardContent>
    </Card>
  );
}

function OutreachChart({ data }: { data: ReportData }) {
  const mounted = useMounted();
  const rows = data.series.map((s) => ({ ...s, label: bucketLabel(s.key, data.weekly) }));
  const total = OUTREACH.reduce((n, o) => n + data.outreach[o.key], 0);
  return (
    <Card className="card-shadow rounded-xl">
      <CardHeader>
        <CardTitle className="font-display text-base font-semibold">Outreach by channel</CardTitle>
        <CardDescription>
          {formatNumber(total)} contacts in this period ·{" "}
          {OUTREACH.map((o) => `${o.label} ${formatNumber(data.outreach[o.key])}`).join(" · ")}
          {data.kpis.noWhatsapp > 0 && ` · ${formatNumber(data.kpis.noWhatsapp)} not on WhatsApp`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          {mounted && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={rows}
                margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                barCategoryGap="30%"
              >
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={axisTick}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={axisTick}
                  width={48}
                  allowDecimals={false}
                  tickFormatter={compact}
                />
                <Tooltip {...tooltipStyle} cursor={{ fill: "var(--color-muted)", opacity: 0.5 }} />
                <Legend
                  iconType="square"
                  wrapperStyle={{ fontSize: 12, color: "var(--color-muted-foreground)" }}
                />
                {OUTREACH.map((o, i) => (
                  <Bar
                    key={o.key}
                    dataKey={o.key}
                    name={o.label}
                    stackId="outreach"
                    fill={o.color}
                    maxBarSize={24}
                    // 2px surface gap between stacked segments; rounded data-end on the top segment.
                    stroke="var(--color-card)"
                    strokeWidth={2}
                    radius={i === OUTREACH.length - 1 ? [4, 4, 0, 0] : 0}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <DataTable
          head={[data.weekly ? "Week of" : "Day", ...OUTREACH.map((o) => o.label)]}
          rows={rows.map((r) => [r.label, ...OUTREACH.map((o) => r[o.key])])}
        />
      </CardContent>
    </Card>
  );
}

function FunnelChart({ data }: { data: ReportData }) {
  const mounted = useMounted();
  const rows = data.funnel.map((f) => ({
    ...f,
    label: STAGES.find((s) => s.value === f.stage)?.label ?? f.stage,
  }));
  const total = rows.reduce((n, r) => n + r.count, 0);
  return (
    <Card className="card-shadow rounded-xl">
      <CardHeader>
        <CardTitle className="font-display text-base font-semibold">
          Where new leads are now
        </CardTitle>
        <CardDescription>
          Current stage of the {formatNumber(total)} leads added in this period
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          {mounted && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={rows}
                layout="vertical"
                margin={{ top: 0, right: 48, left: 8, bottom: 0 }}
              >
                <CartesianGrid stroke="var(--color-border)" horizontal={false} />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tick={axisTick}
                  allowDecimals={false}
                  tickFormatter={compact}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={axisTick}
                  width={80}
                />
                <Tooltip
                  {...tooltipStyle}
                  cursor={{ fill: "var(--color-muted)", opacity: 0.5 }}
                  formatter={(v: number) => [formatNumber(v), "Leads"]}
                />
                <Bar
                  dataKey="count"
                  name="Leads"
                  fill="var(--color-chart-1)"
                  maxBarSize={24}
                  radius={[0, 4, 4, 0]}
                >
                  <LabelList
                    dataKey="count"
                    position="right"
                    style={{ fill: "var(--color-foreground)", fontSize: 12 }}
                    formatter={(v: number) => (v ? formatNumber(v) : "")}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <DataTable
          head={["Stage", "Leads", "Share"]}
          rows={rows.map((r) => [r.label, r.count, pct(r.count, total)])}
        />
      </CardContent>
    </Card>
  );
}

function EmailCampaigns({ data }: { data: ReportData }) {
  return (
    <Card className="card-shadow rounded-xl">
      <CardHeader>
        <CardTitle className="font-display text-base font-semibold">Email campaigns</CardTitle>
        <CardDescription>Campaigns sending or sent in this period</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {!data.emailCampaigns.length ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            No email campaigns in this period.
          </p>
        ) : (
          <div className="max-h-80 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Campaign</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Replies</TableHead>
                  <TableHead className="text-right">Bounced</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.emailCampaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="pl-6">
                      <Link
                        to="/campaigns/$id"
                        params={{ id: c.id }}
                        className="font-medium hover:text-primary"
                      >
                        {c.name}
                      </Link>
                      <p className="text-xs capitalize text-muted-foreground">
                        {c.status} · {formatNumber(c.followUpsSent ?? 0)} follow-ups
                      </p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(c.sent)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(c.replied ?? 0)}{" "}
                      <span className="text-xs text-muted-foreground">
                        ({pct(c.replied ?? 0, c.sent)})
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(c.bounced ?? 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** A thin same-hue meter for a value against the column's maximum. */
function Meter({ value, max }: { value: number; max: number }) {
  return (
    <span className="ml-2 inline-block h-1.5 w-16 overflow-hidden rounded-full bg-muted align-middle">
      <span
        className="block h-full rounded-full bg-chart-1"
        style={{ width: `${max ? (value / max) * 100 : 0}%` }}
      />
    </span>
  );
}

function TeamTable({ data, money }: { data: ReportData; money: (n: number) => string }) {
  const rows = [...(data.team ?? [])].sort(
    (a, b) => b.wonValue - a.wonValue || b.won - a.won || b.contacted - a.contacted,
  );
  const maxContacted = Math.max(0, ...rows.map((r) => r.contacted));
  const download = () =>
    csv(
      "team-report.csv",
      [
        "Staff",
        "Role",
        "Leads owned",
        "Open",
        "Contacted",
        "Calls",
        "WhatsApp",
        "Not on WhatsApp",
        "Emails",
        "Meetings",
        "Notes",
        "Stage moves",
        "Won",
        "Won value",
        "Tasks done",
      ],
      rows.map((r) => [
        r.name,
        r.role,
        r.owned,
        r.open,
        r.contacted,
        r.calls,
        r.whatsapp,
        r.noWhatsapp,
        r.emails,
        r.meetings,
        r.notes,
        r.stageMoves,
        r.won,
        r.wonValue,
        r.tasksDone,
      ]),
    );
  return (
    <Card className="card-shadow rounded-xl">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="font-display text-base font-semibold">Team performance</CardTitle>
          <CardDescription>
            What each person did in this period (leads owned is current)
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={download}>
          <Download className="h-4 w-4" /> CSV
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Staff</TableHead>
                <TableHead className="text-right">Owned</TableHead>
                <TableHead>Contacted</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">WhatsApp</TableHead>
                <TableHead className="hidden text-right xl:table-cell">No WhatsApp</TableHead>
                <TableHead className="text-right">Emails</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Stage moves</TableHead>
                <TableHead className="text-right">Won</TableHead>
                <TableHead className="text-right">Won value</TableHead>
                <TableHead className="hidden text-right md:table-cell">Tasks done</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.userId}>
                  <TableCell className="pl-6">
                    <Link
                      to="/activity"
                      search={{ userId: r.userId }}
                      className="font-medium hover:text-primary"
                    >
                      {r.name}
                    </Link>
                    <p className="text-xs capitalize text-muted-foreground">{r.role}</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(r.owned)}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({formatNumber(r.open)} open)
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatNumber(r.contacted)}
                    <Meter value={r.contacted} max={maxContacted} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(r.calls)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(r.whatsapp)}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums xl:table-cell">
                    {formatNumber(r.noWhatsapp)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(r.emails)}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">
                    {formatNumber(r.stageMoves)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatNumber(r.won)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.wonValue ? money(r.wonValue) : "—"}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">
                    {formatNumber(r.tasksDone)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function CampaignTable({ data, money }: { data: ReportData; money: (n: number) => string }) {
  const rows = data.campaigns;
  const download = () =>
    csv(
      "campaign-report.csv",
      [
        "Campaign",
        "Leads",
        "With phone",
        "With email",
        "Contacted",
        "Qualified or later",
        "Won",
        "Won value",
        "Avg opportunity",
      ],
      rows.map((r) => [
        r.name,
        r.leads,
        r.withPhone,
        r.withEmail,
        r.contacted,
        r.progressed,
        r.won,
        r.wonValue,
        r.avgOpportunity ?? "",
      ]),
    );
  return (
    <Card className="card-shadow rounded-xl">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="font-display text-base font-semibold">
            Campaign performance
          </CardTitle>
          <CardDescription>How far each campaign's leads have got (all time)</CardDescription>
        </div>
        {rows.length > 0 && (
          <Button variant="outline" size="sm" onClick={download}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {!rows.length ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">No campaigns yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Campaign</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Phone / email</TableHead>
                  <TableHead>Contacted</TableHead>
                  <TableHead className="text-right">Qualified+</TableHead>
                  <TableHead className="text-right">Won</TableHead>
                  <TableHead className="text-right">Won value</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Avg 🔥</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.searchId}>
                    <TableCell className="pl-6">
                      <Link
                        to="/leads"
                        search={{ searchId: r.searchId }}
                        className="font-medium hover:text-primary"
                      >
                        {r.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(r.leads)}
                    </TableCell>
                    <TableCell className="hidden text-right text-xs tabular-nums text-muted-foreground md:table-cell">
                      {pct(r.withPhone, r.leads)} / {pct(r.withEmail, r.leads)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {pct(r.contacted, r.leads)}
                      <Meter value={r.contacted} max={r.leads} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(r.progressed)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatNumber(r.won)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.wonValue ? money(r.wonValue) : "—"}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">
                      {r.avgOpportunity ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
