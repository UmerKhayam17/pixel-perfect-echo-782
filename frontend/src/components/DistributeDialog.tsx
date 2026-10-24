import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useInvalidateData, useUsers } from "@/hooks/queries";
import { api } from "@/lib/api";
import { formatNumber } from "@/utils/format";
import type { DistributionPlan, LeadQuery } from "@/types";

export interface DistributeTarget {
  ids?: string[];
  query?: LeadQuery;
  searchId?: string;
  /** Shown to staff in their notification, e.g. the campaign name. */
  label: string;
}

/** Admin: split leads between staff, with a live preview of who gets how many. */
export function DistributeDialog({
  target,
  onClose,
}: {
  target: DistributeTarget | null;
  onClose: () => void;
}) {
  const invalidateData = useInvalidateData();
  const { data: users = [] } = useUsers(!!target);
  const staff = useMemo(() => users.filter((u) => u.active), [users]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<"even" | "balanced">("even");
  const [onlyUnassigned, setOnlyUnassigned] = useState(true);
  const [preview, setPreview] = useState<DistributionPlan | null>(null);
  const [busy, setBusy] = useState(false);

  // Members are the usual choice; admins can be ticked too.
  useEffect(() => {
    if (target) setPicked(new Set(staff.filter((u) => u.role === "member").map((u) => u.id)));
    setPreview(null);
  }, [target, staff]);

  const request = () => ({
    ...(target?.ids
      ? { ids: target.ids }
      : target?.searchId
        ? { searchId: target.searchId }
        : { query: target?.query ?? {} }),
    userIds: [...picked],
    method,
    onlyUnassigned,
    label: target?.label ?? "",
  });

  useEffect(() => {
    if (!target || !picked.size) {
      setPreview(null);
      return;
    }
    const t = window.setTimeout(() => {
      void api
        .distributeLeads({ ...request(), preview: true })
        .then(setPreview, () => setPreview(null));
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, picked, method, onlyUnassigned]);

  async function apply() {
    setBusy(true);
    try {
      const r = await api.distributeLeads({ ...request(), preview: false });
      toast.success(
        `${formatNumber(r.total)} leads distributed: ${r.plan.map((p) => `${p.name} ${p.count}`).join(", ")}. Everyone was notified.`,
      );
      void invalidateData();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not distribute.");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: string, on: boolean) =>
    setPicked((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Shuffle className="h-5 w-5" /> Distribute leads
          </DialogTitle>
          <DialogDescription>
            Split “{target?.label}” between your staff. Each person gets the leads as their own and
            a notification. Won and lost leads are left alone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Give leads to</Label>
            {staff.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active staff — add them on the Team page.
              </p>
            ) : (
              <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {staff.map((u) => {
                  const count = preview?.plan.find((p) => p.userId === u.id)?.count;
                  return (
                    <li key={u.id}>
                      <Label className="flex cursor-pointer items-center gap-3 px-3 py-2 font-normal hover:bg-muted/50">
                        <Checkbox
                          checked={picked.has(u.id)}
                          onCheckedChange={(v) => toggle(u.id, v === true)}
                        />
                        <span className="flex-1 text-sm">
                          {u.name} <span className="text-xs text-muted-foreground">({u.role})</span>
                        </span>
                        {picked.has(u.id) && count !== undefined && (
                          <span className="text-sm font-semibold tabular-nums">
                            {formatNumber(count)}
                          </span>
                        )}
                      </Label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <RadioGroup
            value={method}
            onValueChange={(v) => setMethod(v as typeof method)}
            className="gap-2"
          >
            {[
              {
                value: "even",
                label: "Even split",
                hint: "Take turns — best opportunities are spread fairly.",
              },
              {
                value: "balanced",
                label: "Balance workload",
                hint: "Whoever has the fewest open leads gets the next one.",
              },
            ].map((o) => (
              <Label
                key={o.value}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
              >
                <RadioGroupItem value={o.value} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">{o.label}</span>
                  <span className="block text-xs text-muted-foreground">{o.hint}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox
              checked={onlyUnassigned}
              onCheckedChange={(v) => setOnlyUnassigned(v === true)}
            />
            Only leads nobody owns yet
          </Label>
          <p className="text-sm">
            {!picked.size
              ? "Tick at least one person."
              : preview
                ? `${formatNumber(preview.total)} leads will be distributed.`
                : "Working out the split…"}
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={busy || !preview?.total}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Distribute{" "}
            {preview ? formatNumber(preview.total) : ""} leads
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
