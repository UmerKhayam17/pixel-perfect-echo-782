import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Building2,
  CalendarClock,
  CheckSquare,
  Loader2,
  UserRound,
  X,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Trash2,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth, useInvalidateData, useUsers } from "@/hooks/queries";
import { api } from "@/lib/api";
import {
  daysFromToday,
  dueLabel,
  fromLocalInput,
  relativeTime,
  toLocalInput,
} from "@/utils/format";
import type { Lead, Task, TaskType } from "@/types";

export const TASK_TYPES: { value: TaskType; label: string; icon: LucideIcon }[] = [
  { value: "todo", label: "To-do", icon: CheckSquare },
  { value: "call", label: "Call", icon: Phone },
  { value: "email", label: "Email", icon: Mail },
  { value: "meeting", label: "Meeting", icon: Users },
];

const taskIcon = (type: TaskType) => TASK_TYPES.find((t) => t.value === type)?.icon ?? CheckSquare;

/** Quick due-date presets, as local datetime-input values. */
function presetDue(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(10, 0, 0, 0);
  return toLocalInput(d.toISOString());
}

export function TaskDialog({
  open,
  onOpenChange,
  task,
  leadId,
  leadName,
  defaultAssigneeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Task to edit; omit to create one. */
  task?: Task | null;
  /** Attach a new task to this lead (otherwise one can be picked). */
  leadId?: string;
  leadName?: string;
  /** Who a new task goes to by default, e.g. the lead's owner. */
  defaultAssigneeId?: string | null | undefined;
}) {
  const invalidateData = useInvalidateData();
  const { user, isAdmin } = useAuth();
  const { data: staff = [] } = useUsers(isAdmin && open);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("call");
  const [due, setDue] = useState("");
  const [pickedLead, setPickedLead] = useState<{ id: string; businessName: string } | null>(null);
  const [assignee, setAssignee] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setType(task?.type ?? "call");
    setDue(task ? toLocalInput(task.dueAt) : presetDue(1));
    setPickedLead(null);
    setAssignee(task?.assignedTo ?? defaultAssigneeId ?? user?.id ?? "");
  }, [open, task, defaultAssigneeId, user?.id]);

  async function save() {
    if (!title.trim()) {
      toast.error("Please describe the task.");
      return;
    }
    setSaving(true);
    try {
      const input = {
        title: title.trim(),
        type,
        dueAt: fromLocalInput(due),
        ...(isAdmin && assignee ? { assignedTo: assignee } : {}),
      };
      if (task) await api.updateTask(task.id, input);
      else await api.createTask({ ...input, leadId: leadId ?? pickedLead?.id ?? null });
      const to = staff.find((u) => u.id === assignee);
      toast.success(
        to && to.id !== user?.id && to.id !== task?.assignedTo
          ? `Task given to ${to.name}. They have been notified.`
          : task
            ? "Task updated."
            : "Task added.",
      );
      void invalidateData();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the task.");
    } finally {
      setSaving(false);
    }
  }

  const name = task?.lead?.businessName ?? leadName;
  // A new task from the Tasks page can be tied to any lead.
  const canPickLead = !task && !leadId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">{task ? "Edit task" : "New follow-up"}</DialogTitle>
          <DialogDescription>
            {name
              ? `For ${name}`
              : canPickLead
                ? "Pick the lead it is about, or leave it as a general to-do."
                : "A to-do not tied to a specific lead."}
          </DialogDescription>
        </DialogHeader>
        <form
          id="task-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <ToggleGroup
            type="single"
            variant="outline"
            value={type}
            onValueChange={(v: string) => v && setType(v as TaskType)}
            className="w-full"
          >
            {TASK_TYPES.map((t) => (
              <ToggleGroupItem key={t.value} value={t.value} className="flex-1 gap-1.5">
                <t.icon className="h-4 w-4" /> {t.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {canPickLead && (
            <div className="space-y-1.5">
              <Label>Lead</Label>
              <LeadPicker value={pickedLead} onChange={setPickedLead} />
            </div>
          )}
          {isAdmin && (
            <div className="space-y-1.5">
              <Label htmlFor="task-assignee">Assign to</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger id="task-assignee" className="w-full">
                  <SelectValue placeholder="Choose a teammate" />
                </SelectTrigger>
                <SelectContent>
                  {staff
                    .filter((u) => u.active)
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.id === user?.id ? `${u.name} (me)` : `${u.name} · ${u.role}`}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {assignee && assignee !== user?.id && (
                <p className="text-xs text-muted-foreground">
                  They get a notification and can open the lead, even if it was not shared with
                  them.
                </p>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="task-title">What needs doing?</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Call back about pricing"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-due">Due</Label>
            <Input
              id="task-due"
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["Today", 0],
                  ["Tomorrow", 1],
                  ["In 3 days", 3],
                  ["Next week", 7],
                ] as const
              ).map(([label, days]) => (
                <Button
                  key={label}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setDue(presetDue(days))}
                >
                  {label}
                </Button>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setDue("")}
              >
                No date
              </Button>
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="task-form" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {task ? "Save" : "Add task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Search box for choosing the lead a task is about. */
function LeadPicker({
  value,
  onChange,
}: {
  value: { id: string; businessName: string } | null;
  onChange: (lead: { id: string; businessName: string } | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = window.setTimeout(() => {
      api
        .listLeads({ q: q.trim() || undefined, limit: 8 })
        .then((r) => setResults(r.items))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => window.clearTimeout(t);
  }, [q, open]);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm">
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{value.businessName}</span>
        <button type="button" onClick={() => onChange(null)} aria-label="Remove lead">
          <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
        </button>
      </div>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start font-normal text-muted-foreground"
        >
          <Building2 className="h-4 w-4" /> No lead (search to pick one)
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={q}
            onValueChange={setQ}
            placeholder="Business name, phone, email..."
          />
          <CommandList>
            <CommandEmpty>{loading ? "Searching..." : "No leads found."}</CommandEmpty>
            <CommandGroup>
              {results.map((l) => (
                <CommandItem
                  key={l.id}
                  value={l.id}
                  onSelect={() => {
                    onChange({ id: l.id, businessName: l.businessName });
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{l.businessName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[l.category, l.city].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function TaskRow({ task, showLead = true }: { task: Task; showLead?: boolean }) {
  const invalidateData = useInvalidateData();
  const { user: me } = useAuth();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const Icon = taskIcon(task.type);
  const overdue = !task.done && !!task.dueAt && new Date(task.dueAt) < new Date();
  const today = !task.done && !!task.dueAt && !overdue && daysFromToday(task.dueAt) === 0;

  async function run(action: () => Promise<unknown>, success?: string) {
    setBusy(true);
    try {
      await action();
      if (success) toast.success(success);
      await invalidateData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-start gap-3 py-3">
      <Checkbox
        className="mt-0.5"
        checked={task.done}
        disabled={busy}
        onCheckedChange={(v) =>
          run(
            () => api.updateTask(task.id, { done: v === true }),
            v === true ? "Task completed." : undefined,
          )
        }
        aria-label={task.done ? "Mark as not done" : "Mark as done"}
      />
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-medium ${task.done ? "text-muted-foreground line-through" : "text-foreground"}`}
        >
          <Icon className="mr-1.5 inline h-3.5 w-3.5 text-muted-foreground" />
          {task.title}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {task.done ? (
            <span>Done {task.doneAt ? relativeTime(task.doneAt) : ""}</span>
          ) : task.dueAt ? (
            <span
              className={
                overdue
                  ? "font-medium text-destructive"
                  : today
                    ? "font-medium text-primary"
                    : undefined
              }
            >
              <CalendarClock className="mr-1 inline h-3 w-3" />
              {overdue ? "Overdue · " : ""}
              {dueLabel(task.dueAt)}
            </span>
          ) : (
            <span>No due date</span>
          )}
          {showLead && task.lead && (
            <Link
              to="/leads/$id"
              params={{ id: task.lead.id }}
              className="truncate hover:text-primary"
            >
              · {task.lead.businessName}
            </Link>
          )}
          {task.assignee && (
            <span className="inline-flex items-center gap-1">
              · <UserRound className="h-3 w-3" />
              {task.assignee.id === me?.id ? "You" : task.assignee.name}
              {task.creator && task.creator.id !== task.assignee.id && (
                <span>(from {task.creator.id === me?.id ? "you" : task.creator.name})</span>
              )}
            </span>
          )}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Task actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </DropdownMenuItem>
          {!task.done && (
            <DropdownMenuItem
              onClick={() => {
                const d = new Date(Math.max(Date.now(), new Date(task.dueAt ?? 0).getTime()));
                d.setDate(d.getDate() + 1);
                void run(
                  () => api.updateTask(task.id, { dueAt: d.toISOString() }),
                  "Moved to tomorrow.",
                );
              }}
            >
              <CalendarClock className="h-4 w-4" /> Snooze 1 day
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => run(() => api.deleteTask(task.id), "Task deleted.")}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TaskDialog open={editing} onOpenChange={setEditing} task={task} />
    </li>
  );
}
