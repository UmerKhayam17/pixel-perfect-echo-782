import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Activity as ActivityIcon,
  AlertTriangle,
  ArrowLeft,
  Clock,
  Download,
  Eye,
  FileText,
  Loader2,
  LogIn,
  Mail,
  MessageCircle,
  MousePointerClick,
  Pencil,
  Phone,
  Search,
  Trophy,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminOnly } from "@/components/AdminOnly";
import { EmptyState } from "@/components/EmptyState";
import { useAuditSummary } from "@/hooks/queries";
import { api } from "@/lib/api";
import { formatDate, formatNumber, relativeTime } from "@/utils/format";
import type { AuditEntry, StaffSummary } from "@/types";

type Range = "today" | "yesterday" | "7d" | "30d";

interface ActivitySearch {
  userId?: string | undefined;
  range?: Range | undefined;
}

export const Route = createFileRoute("/activity")({
  validateSearch: (p: Record<string, unknown>): ActivitySearch => ({
    userId: typeof p["userId"] === "string" && p["userId"] ? p["userId"] : undefined,
    range: ["today", "yesterday", "7d", "30d"].includes(String(p["range"]))
      ? (p["range"] as Range)
      : undefined,
  }),
  head: () => ({ meta: [{ title: "Staff Activity — LeadFinder Pro" }] }),
  component: () => (
    <AdminOnly>
      <ActivityPage />
    </AdminOnly>
  ),
});

const RANGES: { value: Range; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

function rangeDates(range: Range): { from: string; to: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const day = 86400000;
  if (range === "today")
    return { from: start.toISOString(), to: new Date(start.getTime() + day).toISOString() };
  if (range === "yesterday")
    return { from: new Date(start.getTime() - day).toISOString(), to: start.toISOString() };
  const days = range === "7d" ? 7 : 30;
  return {
    from: new Date(start.getTime() - (days - 1) * day).toISOString(),
    to: new Date(start.getTime() + day).toISOString(),
  };
}

const hm = (minutes: number) =>
  minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const online = (u: StaffSummary["user"]) =>
  !!u.lastSeenAt && Date.now() - new Date(u.lastSeenAt).getTime() < 6 * 60 * 1000;

function ActivityPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/activity" });
  const range = search.range ?? "today";
  // Keep the range stable for the life of the selection so queries don't refetch every render.
  const { from, to } = useMemo(() => rangeDates(range), [range]);
  const { data, isPending } = useAuditSummary(from, to);
  const staff = data?.users ?? [];
  const selected = search.userId ? staff.find((s) => s.user.id === search.userId) : undefined;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {selected ? (
            <button
              onClick={() => void navigate({ search: (p) => ({ ...p, userId: undefined }) })}
              className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> All staff
            </button>
          ) : null}
          <h2 className="font-display text-xl font-bold">
            {selected ? selected.user.name : "Staff activity"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {selected
              ? `${selected.user.email} · ${selected.user.role}`
              : "What everyone did in the portal: sign-ins, pages, clicks and every change to leads."}
          </p>
        </div>
        <Tabs
          value={range}
          onValueChange={(v) => void navigate({ search: (p) => ({ ...p, range: v as Range }) })}
        >
          <TabsList className="max-w-full justify-start overflow-x-auto">
            {RANGES.map((r) => (
              <TabsTrigger key={r.value} value={r.value}>
                {r.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {isPending ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : selected ? (
        <>
          <StaffMetrics s={selected} />
          <Journey userId={selected.user.id} from={from} to={to} />
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {staff.map((s) => (
              <StaffCard
                key={s.user.id}
                s={s}
                onOpen={() => void navigate({ search: (p) => ({ ...p, userId: s.user.id }) })}
              />
            ))}
          </div>
          <Journey from={from} to={to} />
        </>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = "text-muted-foreground",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: string | undefined;
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icon className={`h-3 w-3 ${tone}`} /> {label}
      </p>
      <p className="font-display text-lg font-bold">
        {typeof value === "number" ? formatNumber(value) : value}
      </p>
    </div>
  );
}

function StaffCard({ s, onOpen }: { s: StaffSummary; onOpen: () => void }) {
  const idle = !s.lastAt;
  return (
    <Card
      className="card-shadow cursor-pointer rounded-xl transition-colors hover:border-primary/40"
      onClick={onOpen}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 truncate font-display text-base font-semibold">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${online(s.user) ? "bg-success" : "bg-muted-foreground/40"}`}
            />
            {s.user.name}
          </CardTitle>
          <CardDescription className="truncate">
            {s.user.role === "admin" ? "Admin" : "Member"} ·{" "}
            {online(s.user)
              ? "online now"
              : s.user.lastSeenAt
                ? `last seen ${relativeTime(s.user.lastSeenAt)}`
                : "never signed in"}
          </CardDescription>
        </div>
        {s.refused > 0 && (
          <Badge
            variant="outline"
            className="shrink-0 border-warning/40 bg-warning/10 text-warning-foreground"
            title="Attempts the system refused (no permission)"
          >
            <AlertTriangle className="mr-1 h-3 w-3" /> {s.refused} blocked
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {idle ? (
          <p className="text-sm text-muted-foreground">No activity in this period.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <Stat icon={Clock} label="Active" value={hm(s.activeMinutes)} tone="text-primary" />
            <Stat icon={Eye} label="Leads viewed" value={s.leadsViewed} />
            <Stat icon={Pencil} label="Leads worked" value={s.leadsWorked} />
            <Stat icon={Phone} label="Calls" value={s.outreach.call} tone="text-success" />
            <Stat
              icon={MessageCircle}
              label="WhatsApp"
              value={s.outreach.whatsapp}
              tone="text-success"
            />
            <Stat icon={Trophy} label="Won" value={s.outreach.won} tone="text-warning-foreground" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StaffMetrics({ s }: { s: StaffSummary }) {
  return (
    <Card className="card-shadow rounded-xl">
      <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4 lg:grid-cols-8">
        <Stat icon={Clock} label="Active time" value={hm(s.activeMinutes)} tone="text-primary" />
        <Stat
          icon={LogIn}
          label="First / last"
          value={s.firstAt && s.lastAt ? `${time(s.firstAt)}–${time(s.lastAt)}` : "—"}
        />
        <Stat icon={Eye} label="Leads viewed" value={s.leadsViewed} />
        <Stat icon={Pencil} label="Leads worked" value={s.leadsWorked} />
        <Stat icon={Phone} label="Calls logged" value={s.outreach.call} tone="text-success" />
        <Stat icon={Mail} label="Emails logged" value={s.outreach.email} />
        <Stat
          icon={MessageCircle}
          label="WhatsApp"
          value={s.outreach.whatsapp}
          tone="text-success"
        />
        <Stat
          icon={Trophy}
          label="Deals won"
          value={s.outreach.won}
          tone="text-warning-foreground"
        />
        <Stat icon={FileText} label="Notes" value={s.outreach.note} />
        <Stat icon={ActivityIcon} label="Stage moves" value={s.outreach.stage_change} />
        <Stat icon={Users} label="Pages opened" value={s.pages} />
        <Stat icon={MousePointerClick} label="Clicks" value={s.clicks} />
        <Stat
          icon={Download}
          label="Exports"
          value={s.exports}
          tone={s.exports ? "text-destructive" : undefined}
        />
        <Stat
          icon={AlertTriangle}
          label="Blocked attempts"
          value={s.refused}
          tone={s.refused ? "text-warning-foreground" : undefined}
        />
      </CardContent>
    </Card>
  );
}

const KINDS: { value: AuditEntry["kind"]; label: string; icon: LucideIcon; className: string }[] = [
  { value: "action", label: "Changes", icon: Pencil, className: "bg-primary/10 text-primary" },
  { value: "page", label: "Pages", icon: Eye, className: "bg-muted text-muted-foreground" },
  {
    value: "click",
    label: "Clicks",
    icon: MousePointerClick,
    className: "bg-muted text-muted-foreground",
  },
  { value: "auth", label: "Sign-ins", icon: LogIn, className: "bg-success/10 text-success" },
];

/** The trail for one person (or everyone), newest first, grouped by day, with "load more". */
function Journey({ userId, from, to }: { userId?: string; from: string; to: string }) {
  const [kinds, setKinds] = useState<AuditEntry["kind"][]>(
    userId ? ["action", "page", "click", "auth"] : ["action", "auth"],
  );
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q), 350);
    return () => window.clearTimeout(t);
  }, [q]);

  async function load(before?: string) {
    setLoading(true);
    try {
      const res = await api.audit({
        ...(userId ? { userId } : {}),
        kind: kinds.join(","),
        from,
        to,
        ...(debouncedQ ? { q: debouncedQ } : {}),
        ...(before ? { before } : {}),
        limit: 150,
      });
      setItems((prev) => (before ? [...prev, ...res.items] : res.items));
      setNext(res.next);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, from, to, kinds.join(","), debouncedQ]);

  const byDay = useMemo(() => {
    const groups: { day: string; entries: AuditEntry[] }[] = [];
    for (const e of items) {
      const day = formatDate(e.createdAt);
      const last = groups.at(-1);
      if (last?.day === day) last.entries.push(e);
      else groups.push({ day, entries: [e] });
    }
    return groups;
  }, [items]);

  return (
    <Card className="card-shadow rounded-xl">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="font-display text-base font-semibold">
            {userId ? "Journey" : "Recent activity across the team"}
          </CardTitle>
          <CardDescription>Newest first. Click a lead name to open it.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {KINDS.map((k) => {
            const on = kinds.includes(k.value);
            return (
              <button
                key={k.value}
                onClick={() =>
                  setKinds(on ? kinds.filter((x) => x !== k.value) : [...kinds, k.value])
                }
                disabled={on && kinds.length === 1}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
              >
                {k.label}
              </button>
            );
          })}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search activity"
              className="h-8 w-44 pl-8 text-xs"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && !items.length ? (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !items.length ? (
          <EmptyState
            icon={ActivityIcon}
            title="Nothing recorded"
            description="No activity matches this period and these filters."
          />
        ) : (
          <div className="space-y-5">
            {byDay.map((g) => (
              <div key={g.day}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.day}
                </p>
                <ol className="relative space-y-2 before:absolute before:inset-y-1 before:left-[13px] before:w-px before:bg-border">
                  {g.entries.map((e) => {
                    const k = KINDS.find((x) => x.value === e.kind) ?? KINDS[0]!;
                    const refused = (e.status ?? 0) >= 400;
                    return (
                      <li key={e.id} className="relative flex items-start gap-3">
                        <span
                          className={`z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 ring-card ${refused ? "bg-warning/15 text-warning-foreground" : k.className}`}
                        >
                          {refused ? (
                            <AlertTriangle className="h-3.5 w-3.5" />
                          ) : (
                            <k.icon className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1 pt-0.5 text-sm">
                          <p className={refused ? "text-warning-foreground" : undefined}>
                            {!userId && <span className="font-medium">{e.userName} · </span>}
                            {e.label}
                            {e.target?.type === "lead" && e.target.id && (
                              <>
                                {" "}
                                <Link
                                  to="/leads/$id"
                                  params={{ id: e.target.id }}
                                  className="font-medium text-primary hover:underline"
                                >
                                  {e.target.label ?? "lead"}
                                </Link>
                              </>
                            )}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {time(e.createdAt)}
                            {e.kind !== "action" && e.path && ` · ${e.path}`}
                            {e.kind === "auth" && e.ip && ` · ${e.ip.replace(/^::ffff:/, "")}`}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
            {next && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void load(next)}
                  disabled={loading}
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />} Load more
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
