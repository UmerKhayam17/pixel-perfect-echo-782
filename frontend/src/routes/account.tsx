import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Laptop, Loader2, LogOut, Save, ShieldCheck, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordHint, PasswordInput, useSignOut } from "@/components/AuthGate";
import { queryKeys, useAuth, useSessions } from "@/hooks/queries";
import { ApiError, api } from "@/lib/api";
import { formatDate, relativeTime } from "@/utils/format";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "My account — LeadFinder Pro" }] }),
  component: AccountPage,
});

function AccountPage() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold">My account</h2>
        <p className="text-sm text-muted-foreground">
          Signed in as {user.email} · <span className="capitalize">{user.role}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Pages you open, buttons you press and changes you make are recorded and visible to
          workspace admins. What you type is not.
        </p>
      </div>
      <ProfileCard />
      {/* Staff keep the password their admin gave them; only admins change their own here. */}
      {user.role === "admin" ? <PasswordCard /> : <ManagedPasswordCard />}
      <SessionsCard />
    </div>
  );
}

function ProfileCard() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
  }, [user?.name, user?.email]);

  const emailChanged = email.trim().toLowerCase() !== user?.email;
  const dirty = name.trim() !== user?.name || emailChanged;

  async function save() {
    setSaving(true);
    setErrors({});
    try {
      await api.updateMe({ name, email, ...(emailChanged ? { currentPassword } : {}) });
      setCurrentPassword("");
      toast.success("Profile updated.");
      void qc.invalidateQueries({ queryKey: queryKeys.auth, exact: true });
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="card-shadow rounded-xl">
      <CardHeader>
        <CardTitle className="font-display text-base font-semibold">Profile</CardTitle>
        <CardDescription>
          Your name appears on notes, calls and stage changes you make.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="me-name">Name</Label>
              <Input
                id="me-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={!!errors["name"]}
              />
              {errors["name"] && <p className="text-xs text-destructive">{errors["name"]}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="me-email">Email (used to sign in)</Label>
              <Input
                id="me-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!errors["email"]}
              />
              {errors["email"] && <p className="text-xs text-destructive">{errors["email"]}</p>}
            </div>
          </div>
          {emailChanged && (
            <div className="space-y-1.5">
              <Label htmlFor="me-current">Current password (to confirm the new email)</Label>
              <PasswordInput
                id="me-current"
                value={currentPassword}
                onChange={setCurrentPassword}
                autoComplete="current-password"
                invalid={!!errors["currentPassword"]}
              />
              {errors["currentPassword"] && (
                <p className="text-xs text-destructive">{errors["currentPassword"]}</p>
              )}
            </div>
          )}
          <Button type="submit" disabled={!dirty || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{" "}
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ManagedPasswordCard() {
  return (
    <Card className="card-shadow rounded-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-base font-semibold">
          <KeyRound className="h-4 w-4" /> Password
        </CardTitle>
        <CardDescription>
          Your password is set by your workspace admin. If you need a new one, or think someone else
          knows it, ask your admin to reset it.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function PasswordCard() {
  const qc = useQueryClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const mismatch = !!confirm && confirm !== next;

  async function save() {
    setSaving(true);
    setErrors({});
    try {
      await api.changePassword({ currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Password changed. You've been signed out on your other devices.");
      void qc.invalidateQueries({ queryKey: queryKeys.sessions });
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      toast.error(err instanceof Error ? err.message : "Could not change the password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="card-shadow rounded-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-base font-semibold">
          <KeyRound className="h-4 w-4" /> Password
        </CardTitle>
        <CardDescription>Changing it signs you out everywhere else.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!mismatch) void save();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="pw-current">Current password</Label>
            <PasswordInput
              id="pw-current"
              value={current}
              onChange={setCurrent}
              autoComplete="current-password"
              invalid={!!errors["currentPassword"]}
            />
            {errors["currentPassword"] && (
              <p className="text-xs text-destructive">{errors["currentPassword"]}</p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pw-new">New password</Label>
              <PasswordInput
                id="pw-new"
                value={next}
                onChange={setNext}
                autoComplete="new-password"
                invalid={!!errors["newPassword"]}
              />
              <PasswordHint password={next} />
              {errors["newPassword"] && (
                <p className="text-xs text-destructive">{errors["newPassword"]}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-confirm">Confirm new password</Label>
              <PasswordInput
                id="pw-confirm"
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
                invalid={mismatch}
              />
              {mismatch && <p className="text-xs text-destructive">Passwords don't match.</p>}
            </div>
          </div>
          <Button type="submit" disabled={saving || !current || !next || mismatch}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}{" "}
            Change password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** "Chrome on Windows" from a user-agent string — good enough to recognise a device. */
function describeAgent(ua: string): string {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Mac OS/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

function SessionsCard() {
  const qc = useQueryClient();
  const { data: sessions = [], isPending } = useSessions();
  const signOut = useSignOut();
  const others = sessions.filter((s) => !s.current);

  async function revoke(id?: string) {
    try {
      if (id) await api.revokeSession(id);
      else await api.revokeOtherSessions();
      toast.success(id ? "Device signed out." : "Signed out everywhere else.");
      void qc.invalidateQueries({ queryKey: queryKeys.sessions });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign out.");
    }
  }

  return (
    <Card className="card-shadow rounded-xl">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="font-display text-base font-semibold">
            Where you're signed in
          </CardTitle>
          <CardDescription>
            Sign out any device you don't recognise, then change your password.
          </CardDescription>
        </div>
        {others.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => revoke()}>
            Sign out others
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <ul className="divide-y divide-border">
            {sessions.map((s) => {
              const Icon = /Android|iPhone|iPad/.test(s.userAgent) ? Smartphone : Laptop;
              return (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {describeAgent(s.userAgent)}
                      {s.current && <Badge variant="secondary">This device</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.ip.replace(/^::ffff:/, "")} · active {relativeTime(s.lastSeenAt)} · signed
                      in {formatDate(s.createdAt)}
                    </p>
                  </div>
                  {s.current ? (
                    <Button variant="ghost" size="sm" onClick={() => void signOut()}>
                      <LogOut className="h-4 w-4" /> Sign out
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => revoke(s.id)}>
                      Sign out
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
