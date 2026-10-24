import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRightLeft, CalendarClock, Loader2, Mail, Phone, Plus, Search, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STAGES, ScoreBadge, TagChips } from "@/components/CrmBadges";
import { EmptyState } from "@/components/EmptyState";
import { PinnedMark } from "@/components/LeadQuickActions";
import { LeadFormDialog } from "@/components/LeadFormDialog";
import {
  queryKeys,
  useInvalidateData,
  useAuth,
  useLeadFacets,
  usePipeline,
  useSettings,
  useUsers,
} from "@/hooks/queries";
import { api } from "@/lib/api";
import { daysFromToday, dueLabel, formatMoney, formatNumber } from "@/utils/format";
import type { LeadStage, PipelineColumn } from "@/types";

interface PipelineSearch {
  q?: string | undefined;
  tag?: string | undefined;
  assignedTo?: string | undefined;
}

export const Route = createFileRoute("/pipeline")({
  validateSearch: (params: Record<string, unknown>): PipelineSearch => {
    const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
    return { q: str(params["q"]), tag: str(params["tag"]), assignedTo: str(params["assignedTo"]) };
  },
  head: () => ({
    meta: [
      { title: "Pipeline — LeadFinder Pro" },
      { name: "description", content: "Drag leads through your sales stages." },
    ],
  }),
  component: PipelinePage,
});

const ALL = "__all__";

function PipelinePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/pipeline" });
  const qc = useQueryClient();
  const invalidateData = useInvalidateData();
  const { settings } = useSettings();
  const { data: facets } = useLeadFacets();
  const query = { q: search.q, tag: search.tag, assignedTo: search.assignedTo };
  const { isAdmin } = useAuth();
  const { data: staff = [] } = useUsers(isAdmin);
  const { data: columns, isPending, isError, error, isFetching } = usePipeline(query);

  const [qInput, setQInput] = useState(search.q ?? "");
  const [dragging, setDragging] = useState<{ id: string; from: LeadStage } | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if ((search.q ?? "") === qInput) return;
    const t = window.setTimeout(
      () => void navigate({ search: (prev) => ({ ...prev, q: qInput || undefined }) }),
      350,
    );
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  async function move(id: string, from: LeadStage, to: LeadStage) {
    if (from === to || !columns) return;
    // Optimistically move the card so the board feels instant.
    const key = queryKeys.pipeline(query);
    const previous = qc.getQueryData<PipelineColumn[]>(key);
    const card = columns.find((c) => c.stage === from)?.leads.find((l) => l.id === id);
    if (card) {
      qc.setQueryData<PipelineColumn[]>(key, (cols) =>
        cols?.map((c) => {
          const value = card.dealValue ?? 0;
          if (c.stage === from)
            return {
              ...c,
              count: c.count - 1,
              value: c.value - value,
              leads: c.leads.filter((l) => l.id !== id),
            };
          if (c.stage === to)
            return {
              ...c,
              count: c.count + 1,
              value: c.value + value,
              leads: [{ ...card, stage: to }, ...c.leads],
            };
          return c;
        }),
      );
    }
    try {
      await api.updateLead(id, { stage: to });
      toast.success(
        `${card?.businessName ?? "Lead"} moved to ${STAGES.find((s) => s.value === to)?.label}.`,
      );
    } catch (err) {
      qc.setQueryData(key, previous);
      toast.error(err instanceof Error ? err.message : "Could not move the lead.");
    } finally {
      void invalidateData();
    }
  }

  const openValue =
    columns?.filter((c) => !["won", "lost"].includes(c.stage)).reduce((n, c) => n + c.value, 0) ??
    0;
  const won = columns?.find((c) => c.stage === "won");
  const closed = (won?.count ?? 0) + (columns?.find((c) => c.stage === "lost")?.count ?? 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold">Pipeline</h2>
          <p className="text-sm text-muted-foreground">
            {columns ? (
              <>
                {formatMoney(openValue, settings.currency)} open ·{" "}
                {formatMoney(won?.value ?? 0, settings.currency)} won
                {closed > 0 && ` · ${Math.round(((won?.count ?? 0) / closed) * 100)}% win rate`}
              </>
            ) : (
              "Loading…"
            )}
            {isFetching && !isPending && (
              <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin" />
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Filter cards…"
              className="w-52 pl-9"
            />
          </div>
          <Select
            value={search.tag ?? ALL}
            onValueChange={(v) =>
              void navigate({ search: (prev) => ({ ...prev, tag: v === ALL ? undefined : v }) })
            }
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All tags</SelectItem>
              {facets?.tags.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={search.assignedTo ?? ALL}
            onValueChange={(v) =>
              void navigate({
                search: (prev) => ({ ...prev, assignedTo: v === ALL ? undefined : v }),
              })
            }
          >
            <SelectTrigger className="w-40" aria-label="Owner">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{isAdmin ? "Everyone's leads" : "All my leads"}</SelectItem>
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
          {(search.q || search.tag || search.assignedTo) && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setQInput("");
                void navigate({ search: {} });
              }}
              aria-label="Clear filters"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add lead
          </Button>
        </div>
      </div>

      {isError ? (
        <EmptyState title="Could not load the pipeline" description={error.message} />
      ) : isPending ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="-mx-4 snap-x snap-mandatory overflow-x-auto scroll-px-4 px-4 pb-2 md:snap-none lg:-mx-8 lg:px-8">
          {/* Phones: near-full-width columns that snap as you swipe; wider screens get the 6-column grid. */}
          <div className="grid auto-cols-[min(85vw,20rem)] grid-flow-col gap-3 md:min-w-[1100px] md:auto-cols-auto md:grid-flow-row md:grid-cols-6">
            {columns.map((col) => {
              const meta = STAGES.find((s) => s.value === col.stage)!;
              return (
                <div
                  key={col.stage}
                  onDragOver={(e) => {
                    if (!dragging) return;
                    e.preventDefault();
                    setOver(col.stage);
                  }}
                  onDragLeave={() => setOver((s) => (s === col.stage ? null : s))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOver(null);
                    if (dragging) void move(dragging.id, dragging.from, col.stage);
                    setDragging(null);
                  }}
                  className={`flex min-h-[60vh] snap-start flex-col rounded-xl border bg-muted/40 transition-colors ${
                    over === col.stage && dragging?.from !== col.stage
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  }`}
                >
                  <div className="border-b border-border px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                      <span className="text-sm font-semibold">{meta.label}</span>
                      <span className="ml-auto rounded-full bg-card px-2 text-xs font-medium text-muted-foreground">
                        {formatNumber(col.count)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatMoney(col.value, settings.currency)}
                    </p>
                  </div>
                  <div className="flex-1 space-y-2 p-2">
                    {col.leads.map((lead) => (
                      <PipelineCard
                        key={lead.id}
                        lead={lead}
                        currency={settings.currency}
                        dragging={dragging?.id === lead.id}
                        onMove={(to) => void move(lead.id, col.stage, to)}
                        onDragStart={() => setDragging({ id: lead.id, from: col.stage })}
                        onDragEnd={() => {
                          setDragging(null);
                          setOver(null);
                        }}
                      />
                    ))}
                    {col.count > col.leads.length && (
                      <Link
                        to="/leads"
                        search={{ stage: col.stage, q: search.q }}
                        className="block py-2 text-center text-xs text-muted-foreground hover:text-primary"
                      >
                        +{formatNumber(col.count - col.leads.length)} more in list view
                      </Link>
                    )}
                    {col.count === 0 && (
                      <p className="py-6 text-center text-xs text-muted-foreground">
                        No leads here
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <LeadFormDialog open={adding} onOpenChange={setAdding} lead={null} />
    </div>
  );
}

function PipelineCard({
  lead,
  currency,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  lead: PipelineColumn["leads"][number];
  currency: string;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  /** Touch screens can't drag, so every card also has a "Move to" menu. */
  onMove: (to: LeadStage) => void;
}) {
  const next = lead.nextTask;
  const overdue = next && new Date(next.dueAt) < new Date();
  return (
    <Card
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`group cursor-grab gap-0 rounded-lg py-0 shadow-sm transition-opacity active:cursor-grabbing ${dragging ? "opacity-40" : ""}`}
    >
      <CardContent className="space-y-1.5 p-3">
        <div className="flex items-start gap-2">
          <Link
            to="/leads/$id"
            params={{ id: lead.id }}
            className="min-w-0 flex-1 text-sm font-semibold leading-snug break-words hover:text-primary"
            draggable={false}
          >
            <PinnedMark pinned={lead.pinned} /> {lead.businessName}
          </Link>
          <ScoreBadge score={lead.score} />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {[lead.category, lead.city].filter(Boolean).join(" · ")}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {lead.dealValue != null && (
            <span className="font-semibold text-foreground">
              {formatMoney(lead.dealValue, currency)}
            </span>
          )}
          {lead.phone && <Phone className="h-3 w-3" aria-label="Has phone" />}
          {lead.email && <Mail className="h-3 w-3" aria-label="Has email" />}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-my-1.5 -mr-1.5 ml-auto h-8 w-8 shrink-0 text-muted-foreground focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                aria-label={`Move ${lead.businessName} to another stage`}
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Move to
              </DropdownMenuLabel>
              {STAGES.filter((s) => s.value !== lead.stage).map((s) => (
                <DropdownMenuItem key={s.value} onClick={() => onMove(s.value)}>
                  <span className={`h-2 w-2 rounded-full ${s.dot}`} /> {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <TagChips tags={lead.tags} max={2} />
        {next && (
          <p
            className={`flex items-center gap-1 truncate text-[11px] ${overdue ? "font-medium text-destructive" : daysFromToday(next.dueAt) === 0 ? "font-medium text-primary" : "text-muted-foreground"}`}
          >
            <CalendarClock className="h-3 w-3 shrink-0" /> {dueLabel(next.dueAt)} · {next.title}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
