import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  MapPin,
  MessageCircle,
  Radar,
  RefreshCw,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
        <Button className="h-11 w-full" onClick={() => void refetch()}>
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

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: MapPin,
    title: "Leads from Google Maps",
    text: "Businesses with phone numbers, emails, ratings and websites.",
  },
  {
    icon: MessageCircle,
    title: "Email and WhatsApp outreach",
    text: "Personal messages for every business, tracked on its timeline.",
  },
  {
    icon: Users,
    title: "One pipeline for the team",
    text: "Tasks, follow-ups and owners, so every lead has someone on it.",
  },
  {
    icon: BarChart3,
    title: "Reports that show what works",
    text: "Contacts, replies and deals won, per campaign and per person.",
  },
];

function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl shadow-lg ${
          inverted
            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sidebar-primary/30"
            : "bg-primary text-primary-foreground shadow-primary/25"
        }`}
      >
        <Radar className="h-5 w-5" />
      </div>
      <div>
        <p
          className={`font-display text-lg font-bold leading-tight ${inverted ? "text-sidebar-accent-foreground" : "text-foreground"}`}
        >
          LeadFinder Pro
        </p>
        <p
          className={`text-xs ${inverted ? "text-sidebar-foreground/70" : "text-muted-foreground"}`}
        >
          Lead intelligence suite
        </p>
      </div>
    </div>
  );
}

/** Concentric "radar" rings behind the brand panel (decoration only). */
function RadarRings() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 600 600"
      className="pointer-events-none absolute -bottom-48 -right-48 h-[38rem] w-[38rem] text-sidebar-primary"
    >
      {[80, 150, 220, 290].map((r, i) => (
        <circle
          key={r}
          cx="300"
          cy="300"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.22 - i * 0.04}
          strokeWidth="1.5"
        />
      ))}
      <path
        d="M300 300 L512 88"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="300" cy="300" r="7" fill="currentColor" fillOpacity="0.5" />
      <circle cx="420" cy="215" r="5" fill="currentColor" fillOpacity="0.7" />
      <circle cx="205" cy="410" r="4" fill="currentColor" fillOpacity="0.5" />
    </svg>
  );
}

/** Sign-in layout: brand panel on large screens, the form on the right (or alone on phones). */
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
    <div className="flex min-h-screen bg-background">
      <aside className="relative hidden w-[46%] max-w-2xl flex-col justify-between overflow-hidden border-r border-sidebar-border bg-sidebar p-10 text-sidebar-foreground lg:flex xl:p-14">
        <RadarRings />
        <Logo inverted />
        <div className="relative max-w-md space-y-8">
          <div className="space-y-3">
            <h1 className="font-display text-3xl font-bold leading-tight text-sidebar-accent-foreground xl:text-4xl">
              Find local businesses. Reach them. Win the deal.
            </h1>
            <p className="text-sidebar-foreground/80">
              Your team's workspace for collecting leads and turning them into customers.
            </p>
          </div>
          <ul className="space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-primary">
                  <f.icon className="h-4.5 w-4.5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-sidebar-accent-foreground">
                    {f.title}
                  </span>
                  <span className="block text-sm text-sidebar-foreground/70">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative flex items-center gap-2 text-xs text-sidebar-foreground/60">
          <ShieldCheck className="h-4 w-4" /> Private workspace. Accounts are created by your admin.
        </p>
      </aside>

      <main className="flex flex-1 flex-col items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>
          <div className="mb-7 space-y-1.5">
            <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {title}
            </h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {children}
        </div>
      </main>
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
  large = false,
  onCapsLock,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  invalid?: boolean;
  placeholder?: string;
  /** Taller field with a lock icon (sign-in screens). */
  large?: boolean;
  /** Called with whether Caps Lock is on, as the user types. */
  onCapsLock?: (on: boolean) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      {large && (
        <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      )}
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyUp={(e) => onCapsLock?.(e.getModifierState("CapsLock"))}
        onBlur={() => onCapsLock?.(false)}
        autoComplete={autoComplete}
        aria-invalid={invalid}
        placeholder={placeholder}
        className={large ? "h-11 pl-10 pr-11" : "pr-10"}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className={`absolute top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${large ? "right-3" : "right-2"}`}
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

function FormAlert({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {message}
    </p>
  );
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
  const [capsLock, setCapsLock] = useState(false);
  const { submit, busy, message } = useAuthSubmit();

  return (
    <AuthShell title="Welcome back" description="Sign in to your LeadFinder workspace.">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(() => api.login({ email, password, remember }));
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="login-email">Email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="login-email"
              type="email"
              autoComplete="username"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 pl-10"
              autoFocus
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="login-password">Password</Label>
          <PasswordInput
            id="login-password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            placeholder="Your password"
            large
            onCapsLock={setCapsLock}
          />
          {capsLock && (
            <p className="flex items-center gap-1.5 text-xs text-warning-foreground">
              <AlertCircle className="h-3.5 w-3.5" /> Caps Lock is on
            </p>
          )}
        </div>
        <Label className="flex cursor-pointer items-center gap-2.5 text-sm font-normal text-muted-foreground">
          <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
          Keep me signed in on this device
        </Label>
        {message && <FormAlert message={message} />}
        <Button
          type="submit"
          className="h-11 w-full text-[15px]"
          disabled={busy || !email || !password}
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
            </>
          ) : (
            <>
              Sign in <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </form>
      <div className="mt-8 space-y-2 border-t border-border pt-6 text-center text-xs text-muted-foreground">
        <p>
          New here or forgot your password? Your workspace admin creates accounts and resets
          passwords.
        </p>
        <p className="flex items-center justify-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" /> Activity is recorded for security and performance
          reviews.
        </p>
      </div>
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
        <Button className="h-11 w-full" variant="outline" onClick={onRetry}>
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
            large
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
            large
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
            large
          />
          <FieldError message={mismatch ? "Passwords don't match." : undefined} />
        </div>
        {message && !Object.keys(errors).length && <FormAlert message={message} />}
        <Button
          type="submit"
          className="h-11 w-full text-[15px]"
          disabled={busy || !current || !next || mismatch}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save and continue
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={() => void signOut()}>
          Sign out
        </Button>
      </form>
    </AuthShell>
  );
}
