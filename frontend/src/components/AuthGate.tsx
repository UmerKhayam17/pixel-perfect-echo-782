import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, LockKeyhole, Radar, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { queryKeys, useAuth } from "@/hooks/queries";
import { AUTH_EVENT, ApiError, api } from "@/lib/api";

/**
 * Shows the app only to signed-in users. Otherwise renders "not set up yet" instructions, the sign-in form,
 * or the "choose a new password" step for accounts created with a temporary password.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isPending, isError, error, refetch, user } = useAuth();

  // Any API call that finds the session gone re-checks who is signed in.
  useEffect(() => {
    const onAuth = () => void qc.invalidateQueries({ queryKey: queryKeys.auth, exact: true });
    window.addEventListener(AUTH_EVENT, onAuth);
    return () => window.removeEventListener(AUTH_EVENT, onAuth);
  }, [qc]);

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (isError) {
    return (
      <AuthShell title="Can't reach LeadFinder" description={error.message}>
        <Button className="w-full" onClick={() => void refetch()}>
          <RefreshCw className="h-4 w-4" /> Try again
        </Button>
      </AuthShell>
    );
  }
  if (data.setupRequired) return <NotInitializedScreen onRetry={() => void refetch()} />;
  if (!user) return <LoginScreen />;
  if (user.mustChangePassword) return <ForcedPasswordScreen name={user.name} />;
  return <>{children}</>;
}

/** Signs out and drops every cached query so the next user starts clean. */
export function useSignOut() {
  const qc = useQueryClient();
  return async () => {
    try {
      await api.logout();
    } finally {
      await resetForNewUser(qc);
    }
  };
}

/** Drops cached data from the previous user, then re-checks who is signed in. */
async function resetForNewUser(qc: ReturnType<typeof useQueryClient>) {
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
  await qc.invalidateQueries({ queryKey: queryKeys.auth, exact: true });
}

function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <Radar className="h-5 w-5" />
          </div>
          <p className="font-display text-lg font-bold">LeadFinder Pro</p>
        </div>
        <Card className="card-shadow rounded-xl">
          <CardHeader>
            <CardTitle className="font-display text-lg">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </div>
  );
}

export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  invalid,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  invalid?: boolean;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={invalid}
        placeholder={placeholder}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/** Rough strength hint shown under new-password fields (the server enforces the real rules). */
export function PasswordHint({ password }: { password: string }) {
  if (!password)
    return (
      <p className="text-xs text-muted-foreground">
        At least 8 characters. A short sentence is easy to remember.
      </p>
    );
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score++;
  const [label, color] =
    password.length < 8
      ? ["Too short", "bg-destructive"]
      : score <= 2
        ? ["Okay", "bg-warning"]
        : ["Strong", "bg-success"];
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-1.5 flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`flex-1 rounded-full ${i < Math.max(1, score) ? color : "bg-muted"}`}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function FieldError({ message }: { message: string | undefined }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}

function useAuthSubmit() {
  const qc = useQueryClient();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(action: () => Promise<unknown>) {
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      await action();
      await resetForNewUser(qc);
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  return { submit, errors, busy, message };
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const { submit, busy, message } = useAuthSubmit();

  return (
    <AuthShell title="Sign in" description="Welcome back. Sign in to your workspace.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(() => api.login({ email, password, remember }));
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="login-password">Password</Label>
          <PasswordInput
            id="login-password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />
        </div>
        <Label className="flex items-center gap-2 text-sm font-normal">
          <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
          Keep me signed in on this computer
        </Label>
        {message && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {message}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy || !email || !password}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LockKeyhole className="h-4 w-4" />
          )}{" "}
          Sign in
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Accounts are created by your workspace admin. Forgot your password? Ask them to reset it.
          <span className="mt-1 block">
            Activity in this workspace is recorded for security and performance reviews.
          </span>
        </p>
      </form>
    </AuthShell>
  );
}

/** Shown until the server administrator creates the first admin account. No one can sign up here. */
function NotInitializedScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <AuthShell
      title="Workspace not set up yet"
      description="There are no accounts yet. The first admin account is created on the server, not from this page."
    >
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          On the computer running the backend, open a terminal in the backend folder and run:
        </p>
        <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs">
          npm run admin -- create
        </pre>
        <p className="text-muted-foreground">
          Then sign in here with that account and add your staff from the Team page.
        </p>
        <Button className="w-full" variant="outline" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" /> I've created it — continue
        </Button>
      </div>
    </AuthShell>
  );
}

function ForcedPasswordScreen({ name }: { name: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const { submit, errors, busy, message } = useAuthSubmit();
  const signOut = useSignOut();
  const mismatch = !!confirm && confirm !== next;

  return (
    <AuthShell
      title={`Welcome, ${name.split(" ")[0]}`}
      description="You signed in with a temporary password. Choose your own to continue."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (mismatch) return;
          void submit(async () => {
            await api.changePassword({ currentPassword: current, newPassword: next });
            toast.success("Password updated.");
          });
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="forced-current">Temporary password</Label>
          <PasswordInput
            id="forced-current"
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
            invalid={!!errors["currentPassword"]}
          />
          <FieldError message={errors["currentPassword"]} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="forced-new">New password</Label>
          <PasswordInput
            id="forced-new"
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            invalid={!!errors["newPassword"]}
          />
          <PasswordHint password={next} />
          <FieldError message={errors["newPassword"]} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="forced-confirm">Confirm new password</Label>
          <PasswordInput
            id="forced-confirm"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            invalid={mismatch}
          />
          <FieldError message={mismatch ? "Passwords don't match." : undefined} />
        </div>
        {message && !Object.keys(errors).length && (
          <p className="text-sm text-destructive">{message}</p>
        )}
        <Button type="submit" className="w-full" disabled={busy || !current || !next || mismatch}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save and continue
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={() => void signOut()}>
          Sign out
        </Button>
      </form>
    </AuthShell>
  );
}
