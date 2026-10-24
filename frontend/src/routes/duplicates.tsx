import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, EyeOff, GitMerge, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ScoreBadge, StageBadge } from "@/components/CrmBadges";
import { EmptyState } from "@/components/EmptyState";
import { WebsiteLink } from "@/components/LeadResultsTable";
import { useDuplicates, useInvalidateData } from "@/hooks/queries";
import { api } from "@/lib/api";
import { formatDate, formatNumber } from "@/utils/format";
import type { DuplicateGroup, Lead, MatchKey } from "@/types";
import { AdminOnly } from "@/components/AdminOnly";

export const Route = createFileRoute("/duplicates")({
  head: () => ({
    meta: [
      { title: "Duplicates — LeadFinder Pro" },
      { name: "description", content: "Find and merge duplicate leads." },
    ],
  }),
  component: () => (
    <AdminOnly>
      <DuplicatesPage />
    </AdminOnly>
  ),
});

const MATCH_OPTIONS: { key: MatchKey; label: string }[] = [
  { key: "placeId", label: "Google profile" },
  { key: "emailKey", label: "Email" },
  { key: "phoneKey", label: "Phone" },
  { key: "domainKey", label: "Website" },
  { key: "nameKey", label: "Name + city" },
];

/** The lead most worth keeping: furthest in the pipeline, then most complete, then oldest. */
function bestLead(leads: Lead[]): Lead {
  const progress = (l: Lead) => (l.stage === "new" ? 0 : 1);
  return [...leads].sort(
    (a, b) =>
      progress(b) - progress(a) ||
      b.score - a.score ||
      new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime(),
  )[0]!;
}

function DuplicatesPage() {
  const invalidateData = useInvalidateData();
  const qc = useQueryClient();
  const [matchOn, setMatchOn] = useState<MatchKey[]>(MATCH_OPTIONS.map((m) => m.key));
  const { data: groups = [], isPending, isFetching } = useDuplicates(matchOn);
  const [mergingAll, setMergingAll] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  async function mergeAll() {
    setMergingAll(true);
    let merged = 0;
    try {
      for (const g of groups) {
        const keep = bestLead(g.leads);
        await api.mergeLeads(
          keep.id,
          g.leads.filter((l) => l.id !== keep.id).map((l) => l.id),
        );
        merged += g.leads.length - 1;
      }
      toast.success(`${formatNumber(merged)} duplicates merged.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Merge failed.");
    } finally {
      setMergingAll(false);
      setConfirmAll(false);
      void invalidateData();
      void qc.invalidateQueries({ queryKey: ["leads", "duplicates"] });
    }
  }

  const extra = groups.reduce((n, g) => n + g.leads.length - 1, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold">Duplicates</h2>
          <p className="text-sm text-muted-foreground">
            {isPending
              ? "Scanning your leads…"
              : groups.length
                ? `${formatNumber(groups.length)} groups · ${formatNumber(extra)} extra copies`
                : "No duplicates found"}
            {isFetching && !isPending && (
              <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin" />
            )}
          </p>
        </div>
        {groups.length > 0 && (
          <Button onClick={() => setConfirmAll(true)} disabled={mergingAll}>
            {mergingAll ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GitMerge className="h-4 w-4" />
            )}{" "}
            Merge all
          </Button>
        )}
      </div>

      <Card className="card-shadow rounded-xl py-0">
        <CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm">
          <span className="text-muted-foreground">
            Treat leads as the same business when they share:
          </span>
          {MATCH_OPTIONS.map((m) => {
            const on = matchOn.includes(m.key);
            return (
              <button
                key={m.key}
                onClick={() =>
                  setMatchOn(on ? matchOn.filter((k) => k !== m.key) : [...matchOn, m.key])
                }
                disabled={on && matchOn.length === 1}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  on
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </CardContent>
      </Card>

      {isPending ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Your leads are clean"
          description="No two leads share the details selected above."
        />
      ) : (
        groups.map((g) => <GroupCard key={g.id} group={g} />)
      )}

      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        destructive={false}
        title={`Merge all ${formatNumber(groups.length)} groups?`}
        description={`In each group the most progressed and complete lead is kept; ${formatNumber(extra)} copies are merged into it. Details, tags, notes, tasks and email history are combined — nothing is lost except the extra copies.`}
        confirmLabel={mergingAll ? "Merging…" : "Merge all"}
        onConfirm={() => void mergeAll()}
      />
    </div>
  );
}

function GroupCard({ group }: { group: DuplicateGroup }) {
  const invalidateData = useInvalidateData();
  const qc = useQueryClient();
  const [keep, setKeep] = useState(() => bestLead(group.leads).id);
  const [busy, setBusy] = useState(false);

  useEffect(() => setKeep(bestLead(group.leads).id), [group.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await action();
      toast.success(message);
      void invalidateData();
      void qc.invalidateQueries({ queryKey: ["leads", "duplicates"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const others = group.leads.filter((l) => l.id !== keep).map((l) => l.id);

  return (
    <Card className="card-shadow rounded-xl">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex flex-wrap items-center gap-2 font-display text-sm font-semibold">
          {group.leads.length} leads · same
          {group.matchedBy.map((m) => (
            <Badge key={m} variant="secondary">
              {m}
            </Badge>
          ))}
        </CardTitle>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() =>
              run(
                () => api.ignoreDuplicates(group.leads.map((l) => l.id)),
                "Marked as different businesses.",
              )
            }
          >
            <EyeOff className="h-4 w-4" /> Not duplicates
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              run(() => api.mergeLeads(keep, others), `Merged ${others.length} into one lead.`)
            }
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}{" "}
            Merge into selected
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16 pl-4">Keep</TableHead>
                <TableHead>Business</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="hidden lg:table-cell">Website</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="hidden md:table-cell">Score</TableHead>
                <TableHead className="hidden xl:table-cell">Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.leads.map((l) => (
                <TableRow
                  key={l.id}
                  data-state={l.id === keep ? "selected" : undefined}
                  className="cursor-pointer"
                  onClick={() => setKeep(l.id)}
                >
                  <TableCell className="pl-4">
                    <input
                      type="radio"
                      name={`keep-${group.id}`}
                      checked={l.id === keep}
                      onChange={() => setKeep(l.id)}
                      aria-label={`Keep ${l.businessName}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Link
                      to="/leads/$id"
                      params={{ id: l.id }}
                      className="font-medium hover:text-primary"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {l.businessName}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {[l.city, l.country].filter(Boolean).join(", ")} · {l.source}
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{l.phone ?? "—"}</TableCell>
                  <TableCell className="text-sm">{l.email ?? "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell" onClick={(e) => e.stopPropagation()}>
                    <WebsiteLink url={l.website} />
                  </TableCell>
                  <TableCell>
                    <StageBadge stage={l.stage} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <ScoreBadge score={l.score} />
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground xl:table-cell">
                    {formatDate(l.dateAdded)}
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
