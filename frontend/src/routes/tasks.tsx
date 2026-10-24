import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ListTodo, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/EmptyState";
import { TaskDialog, TaskRow } from "@/components/Tasks";
import { useAuth, useTasks, useUsers } from "@/hooks/queries";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { daysFromToday } from "@/utils/format";
import type { Task } from "@/types";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks — LeadFinder Pro" },
      { name: "description", content: "Follow-ups due across all your leads." },
    ],
  }),
  component: TasksPage,
});

const GROUPS: { key: string; title: string; match: (t: Task) => boolean; tone?: string }[] = [
  {
    key: "overdue",
    title: "Overdue",
    match: (t) => !!t.dueAt && new Date(t.dueAt) < new Date(),
    tone: "text-destructive",
  },
  {
    key: "today",
    title: "Today",
    match: (t) => !!t.dueAt && daysFromToday(t.dueAt) === 0,
    tone: "text-primary",
  },
  { key: "week", title: "Next 7 days", match: (t) => !!t.dueAt && daysFromToday(t.dueAt) <= 7 },
  { key: "later", title: "Later", match: (t) => !!t.dueAt },
  { key: "none", title: "No due date", match: () => true },
];

/** Puts each task in the first group it matches. */
function groupTasks(tasks: Task[]) {
  const groups = GROUPS.map((g) => ({ ...g, tasks: [] as Task[] }));
  for (const t of tasks) groups.find((g) => g.match(t))!.tasks.push(t);
  return groups.filter((g) => g.tasks.length);
}

function TasksPage() {
  const [tab, setTab] = useState<"open" | "done">("open");
  const [adding, setAdding] = useState(false);
  const { data: allTasks, isPending, isError, error } = useTasks(tab);
  const { user, isAdmin } = useAuth();
  const { data: staff = [] } = useUsers(isAdmin);
  // "mine" by default; admins can look at anyone's list or the whole team's.
  const [who, setWho] = useState("mine");
  const tasks = (allTasks ?? []).filter((t) =>
    who === "all"
      ? true
      : (t.assignedTo ?? t.createdBy ?? null) === (who === "mine" ? user?.id : who),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold">Tasks</h2>
          <p className="text-sm text-muted-foreground">
            Calls, emails and meetings to follow up on, for any lead.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> New task
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "open" | "done")}>
          <TabsList>
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="done">Completed</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={who} onValueChange={setWho}>
          <SelectTrigger className="w-48" aria-label="Whose tasks">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mine">My tasks</SelectItem>
            <SelectItem value="all">
              {isAdmin ? "Everyone's tasks" : "All tasks I can see"}
            </SelectItem>
            {isAdmin &&
              staff
                .filter((u) => u.active && u.id !== user?.id)
                .map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <EmptyState title="Could not load tasks" description={error.message} />
      ) : isPending ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={tab === "open" ? CheckCircle2 : ListTodo}
          title={tab === "open" ? "You're all caught up" : "No completed tasks yet"}
          description={
            tab === "open"
              ? "Open a lead and schedule a follow-up so nothing slips."
              : "Tasks you tick off show up here."
          }
        />
      ) : tab === "done" ? (
        <Card className="card-shadow rounded-xl py-0">
          <CardContent className="px-5">
            <ul className="divide-y divide-border">
              {tasks.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : (
        groupTasks(tasks).map((g) => (
          <Card key={g.key} className="card-shadow rounded-xl gap-0 pb-1">
            <CardHeader>
              <CardTitle className={`font-display text-sm font-semibold ${g.tone ?? ""}`}>
                {g.title}{" "}
                <span className="ml-1 font-normal text-muted-foreground">{g.tasks.length}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {g.tasks.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </ul>
            </CardContent>
          </Card>
        ))
      )}

      <TaskDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}
