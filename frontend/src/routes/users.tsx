import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  Copy,
  KeyRound,
  Loader2,
  MoreHorizontal,
  ShieldCheck,
  Trash2,
  UserMinus,
  UserPlus,
  UserCheck,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { AdminOnly } from "@/components/AdminOnly";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { StaffAccessDialog } from "@/components/StaffAccessDialog";
import { copyText } from "@/components/DetailRow";
import { queryKeys, useAuth, useUsers } from "@/hooks/queries";
import { ApiError, api } from "@/lib/api";
import { relativeTime } from "@/utils/format";
import type { Role, User } from "@/types";

export const Route = createFileRoute("/users")({
  head: () => ({ meta: [{ title: "Team — LeadFinder Pro" }] }),
  component: () => (
    <AdminOnly>
      <UsersPage />
    </AdminOnly>
  ),
});

/** A readable random temporary password, e.g. "ripe-Otter-4821". */
function tempPassword(): string {
  const words = [
    "amber",
    "brisk",
    "cedar",
    "delta",
    "ember",
    "fable",
    "gusty",
    "harbor",
    "ivory",
    "jolly",
    "kayak",
    "lunar",
    "maple",
    "noble",
    "orbit",
    "pixel",
    "quartz",
    "ripple",
    "sable",
    "tidal",
  ];
  const bytes = crypto.getRandomValues(new Uint32Array(3));
  const w = (i: number) => words[bytes[i]! % words.length]!;
  const second = w(1);
  return `${w(0)}-${second[0]!.toUpperCase()}${second.slice(1)}-${1000 + (bytes[2]! % 9000)}`;
}

const ROLE_INFO: Record<Role, string> = {
  admin: "Everything, including settings, email accounts and the team.",
  member: "Leads, pipeline, tasks, searches and campaigns. No settings or email accounts.",
};

function UsersPage() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const { data: users = [], isPending } = useUsers();
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<User | null>(null);
  const [accessFor, setAccessFor] = useState<User | null>(null);
  const [toDelete, setToDelete] = useState<User | null>(null);

  async function update(user: User, patch: { role?: Role; active?: boolean }, success: string) {
    try {
      await api.updateUser(user.id, patch);
      toast.success(success);
      void qc.invalidateQueries({ queryKey: queryKeys.users });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update.");
    }
  }

  async function remove() {
    if (!toDelete) return;
    try {
      await api.deleteUser(toDelete.id);
      toast.success(`${toDelete.name} removed.`);
      void qc.invalidateQueries({ queryKey: queryKeys.users });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove.");
    } finally {
      setToDelete(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold">Team</h2>
          <p className="text-sm text-muted-foreground">
            Who can sign in to this workspace, and what they can do.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <UserPlus className="h-4 w-4" /> Add teammate
        </Button>
      </div>

      <Card className="card-shadow rounded-xl py-0">
        <CardContent className="p-0">
          {isPending ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Person</TableHead>
                    <TableHead className="hidden md:table-cell">Role</TableHead>
                    <TableHead className="hidden md:table-cell">Status</TableHead>
                    <TableHead className="hidden md:table-cell">Can see</TableHead>
                    <TableHead className="hidden lg:table-cell">Last active</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const self = u.id === me?.id;
                    const roleSelect = (
                      <Select
                        value={u.role}
                        disabled={self}
                        onValueChange={(role) =>
                          update(
                            u,
                            { role: role as Role },
                            `${u.name} is now ${role === "admin" ? "an admin" : "a member"}.`,
                          )
                        }
                      >
                        <SelectTrigger className="h-8 w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                        </SelectContent>
                      </Select>
                    );
                    const statusBadge = (
                      <>
                        {!u.active ? (
                          <Badge variant="outline">Deactivated</Badge>
                        ) : u.mustChangePassword ? (
                          <Badge
                            variant="outline"
                            className="border-warning/40 bg-warning/10 text-warning-foreground"
                          >
                            Temporary password
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-success/30 bg-success/10 text-success"
                          >
                            Active
                          </Badge>
                        )}
                      </>
                    );
                    const canSee = (
                      <>
                        {u.role === "admin" ? (
                          <span className="text-sm text-muted-foreground">All leads</span>
                        ) : (
                          <button
                            onClick={() => setAccessFor(u)}
                            className="text-left text-sm hover:text-primary"
                            title="Choose which searches and imports this person can see"
                          >
                            <span className="font-medium">
                              {(u.visibleLeads ?? 0).toLocaleString("en-US")} leads
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {u.access?.searchIds.length ?? 0} searches ·{" "}
                              {u.access?.importIds.length ?? 0} imports
                            </span>
                          </button>
                        )}
                      </>
                    );
                    return (
                      <TableRow key={u.id} className={u.active ? undefined : "opacity-60"}>
                        <TableCell className="pl-4">
                          <p className="font-medium">
                            {u.name}{" "}
                            {self && (
                              <span className="text-xs font-normal text-muted-foreground">
                                (you)
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                          {u.workload && (
                            <p className="mt-1 flex flex-wrap gap-x-3 text-xs">
                              <Link
                                to="/leads"
                                search={{ assignedTo: u.id }}
                                className="text-primary hover:underline"
                              >
                                {u.workload.ownedLeads} leads owned ({u.workload.openLeads} open)
                              </Link>
                              <span
                                className={
                                  u.workload.overdueTasks
                                    ? "text-destructive"
                                    : "text-muted-foreground"
                                }
                              >
                                {u.workload.openTasks} open tasks
                                {u.workload.overdueTasks
                                  ? `, ${u.workload.overdueTasks} overdue`
                                  : ""}
                              </span>
                            </p>
                          )}
                          {/* Phones: role, status and access sit under the name. */}
                          <div className="mt-2 flex flex-wrap items-center gap-2 md:hidden">
                            {roleSelect}
                            {statusBadge}
                          </div>
                          <div className="mt-1.5 md:hidden">{canSee}</div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{roleSelect}</TableCell>
                        <TableCell className="hidden md:table-cell">{statusBadge}</TableCell>
                        <TableCell className="hidden md:table-cell">{canSee}</TableCell>
                        <TableCell className="hidden text-muted-foreground lg:table-cell">
                          {u.lastSeenAt
                            ? relativeTime(u.lastSeenAt)
                            : u.lastLoginAt
                              ? relativeTime(u.lastLoginAt)
                              : "Never"}
                        </TableCell>
                        <TableCell>
                          {!self && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  aria-label="User actions"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {u.role !== "admin" && (
                                  <DropdownMenuItem onClick={() => setAccessFor(u)}>
                                    <ShieldCheck className="h-4 w-4" /> Access & permissions
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem asChild>
                                  <Link to="/activity" search={{ userId: u.id }}>
                                    <Activity className="h-4 w-4" /> View activity
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setResetting(u)}>
                                  <KeyRound className="h-4 w-4" /> Reset password
                                </DropdownMenuItem>
                                {u.active ? (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      update(
                                        u,
                                        { active: false },
                                        `${u.name} can no longer sign in.`,
                                      )
                                    }
                                  >
                                    <UserMinus className="h-4 w-4" /> Deactivate
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      update(u, { active: true }, `${u.name} can sign in again.`)
                                    }
                                  >
                                    <UserCheck className="h-4 w-4" /> Reactivate
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setToDelete(u)}
                                >
                                  <Trash2 className="h-4 w-4" /> Remove
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(Object.keys(ROLE_INFO) as Role[]).map((r) => (
          <div key={r} className="rounded-lg border border-border bg-card p-3 text-sm">
            <p className="flex items-center gap-1.5 font-medium capitalize">
              {r === "admin" ? (
                <ShieldCheck className="h-4 w-4 text-primary" />
              ) : (
                <Users className="h-4 w-4 text-muted-foreground" />
              )}{" "}
              {r}
            </p>
            <p className="text-xs text-muted-foreground">{ROLE_INFO[r]}</p>
          </div>
        ))}
      </div>

      <AddUserDialog open={adding} onOpenChange={setAdding} />
      <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />
      <StaffAccessDialog user={accessFor} onClose={() => setAccessFor(null)} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={`Remove ${toDelete?.name}?`}
        description="They are signed out and can't sign in again. Their notes and history stay on your leads. To keep the account but block access, deactivate it instead."
        confirmLabel="Remove"
        onConfirm={remove}
      />
    </div>
  );
}

/** Shows the new password once, with a copy button, after it has been set. */
function TempPasswordNotice({ email, password }: { email: string; password: string }) {
  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
      <p>
        Share these sign-in details privately (not by public chat). This is their password; they
        can't change it themselves, but you can reset it here any time.
      </p>
      <div className="flex items-center gap-2 rounded-md bg-card px-3 py-2 font-mono text-xs">
        <span className="flex-1 break-all">
          {email} / {password}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => copyText(`Email: ${email}\nPassword: ${password}`, "Sign-in details")}
          aria-label="Copy"
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function AddUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setEmail("");
    setRole("member");
    setPassword(tempPassword());
    setErrors({});
    setCreated(null);
  }, [open]);

  async function save() {
    setSaving(true);
    setErrors({});
    try {
      const user = await api.createUser({ name, email, role, password });
      setCreated({ email: user.email, password });
      void qc.invalidateQueries({ queryKey: queryKeys.users });
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      toast.error(err instanceof Error ? err.message : "Could not add the teammate.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {created ? "Teammate added" : "Add a teammate"}
          </DialogTitle>
          <DialogDescription>
            {created
              ? "Copy their sign-in details now — the password isn't shown again."
              : "Choose their password. They sign in with it; only an admin can change it."}
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <TempPasswordNotice {...created} />
        ) : (
          <form
            id="add-user"
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-name">Name</Label>
              <Input
                id="new-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                aria-invalid={!!errors["name"]}
              />
              {errors["name"] && <p className="text-xs text-destructive">{errors["name"]}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-email">Email</Label>
              <Input
                id="new-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!errors["email"]}
              />
              {errors["email"] && <p className="text-xs text-destructive">{errors["email"]}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{ROLE_INFO[role]}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Password</Label>
              <div className="flex gap-2">
                <Input
                  id="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="font-mono"
                  aria-invalid={!!errors["password"]}
                />
                <Button type="button" variant="outline" onClick={() => setPassword(tempPassword())}>
                  New
                </Button>
              </div>
              {errors["password"] && (
                <p className="text-xs text-destructive">{errors["password"]}</p>
              )}
            </div>
          </form>
        )}
        <DialogFooter>
          {created ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" form="add-user" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Add teammate
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setPassword(tempPassword());
      setDone(false);
    }
  }, [user]);

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      await api.resetUserPassword(user.id, password);
      setDone(true);
      void qc.invalidateQueries({ queryKey: queryKeys.users });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset the password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Reset {user?.name}'s password</DialogTitle>
          <DialogDescription>
            They'll be signed out everywhere and sign in again with the new password.
          </DialogDescription>
        </DialogHeader>
        {done && user ? (
          <TempPasswordNotice email={user.email} password={password} />
        ) : (
          <div className="flex gap-2">
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="font-mono"
              aria-label="New password"
            />
            <Button type="button" variant="outline" onClick={() => setPassword(tempPassword())}>
              New
            </Button>
          </div>
        )}
        <DialogFooter>
          {done ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving || password.length < 8}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Reset password
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
