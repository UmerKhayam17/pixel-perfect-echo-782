import { toast } from "sonner";
import { CalendarClock, Eye, Pencil, UserRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth, useInvalidateData, useLeadHistory, useUsers } from "@/hooks/queries";
import { api } from "@/lib/api";
import { dueLabel, relativeTime } from "@/utils/format";
import type { Activity, Lead, Task } from "@/types";

const NONE = "__none__";

// Work done by a person (campaign sends and email replies are not anyone's work).
const WORK_TYPES = new Set([
  "call",
  "email",
  "whatsapp",
  "whatsapp_unavailable",
  "meeting",
  "note",
  "stage_change",
]);

/**
 * Who's working on the lead: its owner (admins can change it), who has open tasks on it and
 * everyone who has contacted or updated it. Admins also see every view and change.
 */
export function LeadOwnerCard({
  lead,
  activities,
  tasks,
}: {
  lead: Lead;
  activities: Activity[];
  tasks: Task[];
}) {
  const { isAdmin, user } = useAuth();
  const invalidateData = useInvalidateData();
  const { data: staff = [] } = useUsers(isAdmin);
  const { data: history = [] } = useLeadHistory(lead.id, isAdmin);
  const owner = typeof lead.assignedTo === "object" ? lead.assignedTo : null;

  async function reassign(value: string) {
    try {
      await api.updateLead(lead.id, { assignedTo: value === NONE ? null : value });
      toast.success(
        value === NONE
          ? "Lead unassigned."
          : `Assigned to ${staff.find((u) => u.id === value)?.name}.`,
      );
      void invalidateData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reassign.");
    }
  }

  const openTasks = tasks.filter((t) => !t.done && t.assignee);
  // Everyone who did something on the lead, most recent first.
  const people = new Map<string, { count: number; last: string }>();
  for (const a of activities) {
    if (!a.by || !WORK_TYPES.has(a.type)) continue;
    const p = people.get(a.by);
    if (p) p.count++;
    else people.set(a.by, { count: 1, last: a.date });
  }

  // Collapse repeated views by the same person so the list stays readable.
  const entries = history
    .filter(
      (h, i) =>
        !(
          h.action === "lead.view" &&
          history[i - 1]?.action === "lead.view" &&
          history[i - 1]?.userId === h.userId
        ),
    )
    .slice(0, 25);

  return (
    <Card className="card-shadow rounded-xl">
      <CardHeader>
        <CardTitle className="font-display text-base font-semibold">Who's working on it</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-xs font-medium text-muted-foreground">Owner</p>
        {isAdmin ? (
          <Select value={owner?.id ?? NONE} onValueChange={reassign}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Unassigned</SelectItem>
              {staff
                .filter((u) => u.active)
                .map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-muted-foreground" />
            {owner ? (owner.id === user?.id ? "You" : owner.name) : "Not assigned to anyone"}
          </p>
        )}

        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">Open tasks</p>
          {openTasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nobody has an open task on this lead.</p>
          ) : (
            <ul className="space-y-1.5">
              {openTasks.map((t) => (
                <li key={t.id} className="flex items-start gap-2 text-xs">
                  <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">
                      {t.assignee!.id === user?.id ? "You" : t.assignee!.name}
                    </span>
                    : {t.title}
                    <span className="block text-muted-foreground">
                      {t.dueAt ? dueLabel(t.dueAt) : "No due date"}
                      {t.creator && t.creator.id !== t.assignee!.id && ` · from ${t.creator.name}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">Worked on it</p>
          {people.size === 0 ? (
            <p className="text-xs text-muted-foreground">No calls, messages or notes yet.</p>
          ) : (
            <ul className="space-y-1">
              {[...people].map(([name, p]) => (
                <li key={name} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate font-medium">{name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {p.count} action{p.count === 1 ? "" : "s"} · last {relativeTime(p.last)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {isAdmin && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground">Full history (admins)</p>
            {entries.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nobody has opened it yet.</p>
            ) : (
              <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                {entries.map((h) => (
                  <li key={h.id} className="flex items-start gap-2 text-xs">
                    {h.action === "lead.view" ? (
                      <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{h.userName}</span>{" "}
                      {h.action === "lead.view"
                        ? "viewed it"
                        : h.label.charAt(0).toLowerCase() + h.label.slice(1)}
                      <span className="block text-muted-foreground">
                        {relativeTime(h.createdAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
