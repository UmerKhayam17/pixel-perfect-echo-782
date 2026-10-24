import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Ban,
  Loader2,
  MailCheck,
  MoreHorizontal,
  Pencil,
  Plus,
  Reply,
  Send,
  Server,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AdminOnly } from "@/components/AdminOnly";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { queryKeys, useSenders, useSuppressions } from "@/hooks/queries";
import { ApiError, api } from "@/lib/api";
import { relativeTime } from "@/utils/format";
import type { Sender, SenderInput } from "@/types";

export const Route = createFileRoute("/email-setup")({
  head: () => ({
    meta: [
      { title: "Email setup — LeadFinder Pro" },
      { name: "description", content: "Sender accounts and the do-not-email list." },
    ],
  }),
  component: () => (
    <AdminOnly>
      <EmailSetupPage />
    </AdminOnly>
  ),
});

/** Common providers: picking one fills in the server settings. */
const PRESETS: { label: string; host: string; port: number; secure: boolean; hint: string; imapHost?: string }[] = [
  {
    label: "Gmail / Google Workspace",
    host: "smtp.gmail.com",
    imapHost: "imap.gmail.com",
    port: 465,
    secure: true,
    hint: "Turn on 2-Step Verification, then create an App Password (Google Account → Security → App passwords) and paste it as the password.",
  },
  {
    label: "Outlook / Microsoft 365",
    host: "smtp.office365.com",
    imapHost: "outlook.office365.com",
    port: 587,
    secure: false,
    hint: "Your admin may need to enable “Authenticated SMTP” for the mailbox.",
  },
  {
    label: "Zoho Mail",
    host: "smtp.zoho.com",
    imapHost: "imap.zoho.com",
    port: 465,
    secure: true,
    hint: "Use an app-specific password if two-factor login is on.",
  },
  {
    label: "Yahoo Mail",
    host: "smtp.mail.yahoo.com",
    imapHost: "imap.mail.yahoo.com",
    port: 465,
    secure: true,
    hint: "Generate an app password in Yahoo Account Security.",
  },
  {
    label: "Other / cPanel / custom domain",
    host: "",
    port: 587,
    secure: false,
    hint: "Find the SMTP details in your hosting or email provider's settings.",
  },
];

const EMPTY: SenderInput = {
  label: "",
  fromName: "",
  fromEmail: "",
  replyTo: null,
  host: "",
  port: 587,
  secure: false,
  username: "",
  password: "",
  signature: "",
  dailyLimit: 200,
  imap: { enabled: true, host: "", port: 993, secure: true, username: "", password: "" },
};

function EmailSetupPage() {
  const { data: senders, isPending } = useSenders();
  const [editing, setEditing] = useState<Sender | "new" | null>(null);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold">Email setup</h2>
          <p className="text-sm text-muted-foreground">
            The mailboxes your campaigns send from. Emails go out through your own provider, so
            replies land in your inbox.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Add sender
        </Button>
      </div>

      {isPending ? (
        <div className="flex justify-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : !senders?.length ? (
        <EmptyState
          icon={Server}
          title="No sender accounts yet"
          description="Connect a Gmail, Outlook, Zoho or custom-domain mailbox to start sending campaigns."
          action={
            <Button onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" /> Add sender
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {senders.map((s) => (
            <SenderCard key={s.id} sender={s} onEdit={() => setEditing(s)} />
          ))}
        </div>
      )}

      <SuppressionCard />

      <SenderDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        sender={editing === "new" ? null : editing}
      />
    </div>
  );
}

function SenderCard({ sender, onEdit }: { sender: Sender; onEdit: () => void }) {
  const qc = useQueryClient();
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [checking, setChecking] = useState(false);

  async function checkInbox() {
    setChecking(true);
    try {
      const r = await api.testImap(sender.id);
      toast.success(
        `Inbox connected — checked ${r.checked} new message${r.checked === 1 ? "" : "s"}: ${r.reply} replies, ${r.unsubscribe} unsubscribes, ${r.bounce} bounces.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect to the inbox.");
    } finally {
      setChecking(false);
      void qc.invalidateQueries({ queryKey: queryKeys.senders });
    }
  }

  async function test() {
    setTesting(true);
    try {
      const { to } = await api.testSender(sender.id, testTo.trim() || sender.fromEmail);
      toast.success(`Test email sent to ${to}. Check that inbox (and spam).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed.");
    } finally {
      setTesting(false);
    }
  }

  async function remove() {
    try {
      await api.deleteSender(sender.id);
      toast.success("Sender removed.");
      void qc.invalidateQueries({ queryKey: queryKeys.senders });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setConfirmDelete(false);
    }
  }

  return (
    <Card className="card-shadow rounded-xl">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="truncate font-display text-base font-semibold">
            {sender.label}
          </CardTitle>
          <CardDescription className="truncate">
            {sender.fromName} &lt;{sender.fromEmail}&gt;
          </CardDescription>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Sender actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Badge variant="secondary">
            {sender.host}:{sender.port} {sender.secure ? "SSL" : "STARTTLS"}
          </Badge>
          <Badge variant="secondary">{sender.dailyLimit}/day max</Badge>
          {sender.replyTo && <Badge variant="secondary">Replies → {sender.replyTo}</Badge>}
        </div>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs">
          {sender.imap?.enabled ? (
            <span className={sender.imapState?.lastError ? "text-destructive" : "text-muted-foreground"}>
              <Reply className="mr-1 inline h-3.5 w-3.5" />
              {sender.imapState?.lastError
                ? `Reply tracking: ${sender.imapState.lastError}`
                : sender.imapState?.lastCheckedAt
                  ? `Reply tracking on · inbox checked ${relativeTime(sender.imapState.lastCheckedAt)}`
                  : "Reply tracking on · first check within a few minutes"}
            </span>
          ) : (
            <span className="text-muted-foreground">Reply tracking off — replies won't stop follow-ups automatically.</span>
          )}
          {sender.imap?.enabled && (
            <Button size="sm" variant="ghost" className="h-7 shrink-0 text-xs" onClick={checkInbox} disabled={checking}>
              {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Check now"}
            </Button>
          )}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void test();
          }}
        >
          <Input
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder={`Send test to ${sender.fromEmail}`}
            type="email"
            className="h-8"
          />
          <Button type="submit" size="sm" variant="outline" disabled={testing}>
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MailCheck className="h-4 w-4" />
            )}{" "}
            Test
          </Button>
        </form>
      </CardContent>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Remove this sender?"
        description="Draft and paused campaigns using it will need another sender before they can send."
        confirmLabel="Remove"
        onConfirm={remove}
      />
    </Card>
  );
}

function SenderDialog({
  open,
  onOpenChange,
  sender,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sender: Sender | null;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<SenderInput>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [preset, setPreset] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setPreset(null);
    setDraft(
      sender
        ? {
            ...sender,
            password: "",
            imap: {
              enabled: sender.imap?.enabled ?? false,
              host: sender.imap?.host ?? "",
              port: sender.imap?.port ?? 993,
              secure: sender.imap?.secure ?? true,
              username: sender.imap?.username ?? "",
              password: "",
            },
          }
        : EMPTY,
    );
  }, [open, sender]);

  const set = <K extends keyof SenderInput>(key: K, value: SenderInput[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const hint = PRESETS.find((p) => p.label === preset)?.hint;

  async function save() {
    setSaving(true);
    try {
      const input = { ...draft, username: draft.username || draft.fromEmail };
      if (sender) await api.updateSender(sender.id, input);
      else await api.createSender(input);
      toast.success(sender ? "Sender updated." : "Sender added. Send a test to check it works.");
      void qc.invalidateQueries({ queryKey: queryKeys.senders });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      toast.error(err instanceof Error ? err.message : "Could not save the sender.");
    } finally {
      setSaving(false);
    }
  }

  const field = (
    key: keyof SenderInput,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`sender-${key}`}>{label}</Label>
      <Input
        id={`sender-${key}`}
        value={(draft[key] as string | number | null) ?? ""}
        onChange={(e) =>
          set(key, (props.type === "number" ? Number(e.target.value) : e.target.value) as never)
        }
        aria-invalid={!!errors[key]}
        {...props}
      />
      {errors[key] && <p className="text-xs text-destructive">{errors[key]}</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">
            {sender ? "Edit sender" : "Add a sender account"}
          </DialogTitle>
          <DialogDescription>
            SMTP details of the mailbox campaigns will send from.
          </DialogDescription>
        </DialogHeader>
        <form
          id="sender-form"
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {!sender && (
            <div className="space-y-2">
              <Label>Provider</Label>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <Button
                    key={p.label}
                    type="button"
                    size="sm"
                    variant={preset === p.label ? "default" : "outline"}
                    onClick={() => {
                      setPreset(p.label);
                      setDraft((d) => ({
                        ...d,
                        host: p.host,
                        port: p.port,
                        secure: p.secure,
                        imap: { ...(d.imap ?? EMPTY.imap!), host: p.imapHost ?? "" },
                      }));
                    }}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
              {hint && (
                <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {hint}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field("fromName", "From name *", { placeholder: "e.g. Ali from Tekeye" })}
            {field("fromEmail", "From email *", {
              type: "email",
              placeholder: "ali@yourdomain.com",
            })}
            {field("replyTo", "Reply-to (optional)", {
              type: "email",
              placeholder: "Defaults to the from email",
            })}
            {field("label", "Label (optional)", { placeholder: "e.g. Sales mailbox" })}
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-[1fr_8rem]">
            {field("host", "SMTP server *", { placeholder: "smtp.yourprovider.com" })}
            {field("port", "Port *", { type: "number", min: 1, max: 65535 })}
            {field("username", "Username", { placeholder: "Usually your full email address" })}
            <div className="space-y-1.5">
              <Label htmlFor="sender-password">{sender ? "Password" : "Password *"}</Label>
              <Input
                id="sender-password"
                type="password"
                autoComplete="new-password"
                value={draft.password ?? ""}
                onChange={(e) => set("password", e.target.value)}
                placeholder={
                  sender?.hasPassword ? "Saved — leave empty to keep" : "Password or app password"
                }
                aria-invalid={!!errors["password"]}
              />
              {errors["password"] && (
                <p className="text-xs text-destructive">{errors["password"]}</p>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 sm:col-span-2">
              <div>
                <p className="text-sm font-medium">Use SSL/TLS from the start</p>
                <p className="text-xs text-muted-foreground">
                  On for port 465. Off for 587/25, which upgrade with STARTTLS.
                </p>
              </div>
              <Switch checked={draft.secure} onCheckedChange={(v) => set("secure", v)} />
            </div>
          </div>

          <ReplyTrackingFields
            imap={draft.imap ?? EMPTY.imap!}
            hasSavedPassword={!!sender?.imap?.hasPassword}
            onChange={(imap) => set("imap", imap)}
          />

          <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-[1fr_10rem]">
            <div className="space-y-1.5">
              <Label htmlFor="sender-signature">Signature</Label>
              <Textarea
                id="sender-signature"
                rows={4}
                value={draft.signature}
                onChange={(e) => set("signature", e.target.value)}
                placeholder={"Ali Khan\nTekeye Digital\n+92 300 0000000"}
              />
              <p className="text-xs text-muted-foreground">
                Added to the end of every email (or wherever you put {"{{signature}}"}).
              </p>
            </div>
            {field("dailyLimit", "Daily limit", { type: "number", min: 1, max: 10000 })}
          </div>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="sender-form" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sender ? "Save" : "Add sender"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SuppressionCard() {
  const qc = useQueryClient();
  const { data: list = [] } = useSuppressions();
  const [input, setInput] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.suppressions });

  async function add() {
    const emails = input.split(/[\s,;]+/).filter(Boolean);
    if (!emails.length) return;
    try {
      const { added } = await api.addSuppressions(emails);
      toast.success(`${added} address${added === 1 ? "" : "es"} added to the do-not-email list.`);
      setInput("");
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add.");
    }
  }

  async function remove(email: string) {
    try {
      await api.removeSuppression(email);
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove.");
    }
  }

  return (
    <Card className="card-shadow rounded-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-base font-semibold">
          <Ban className="h-4 w-4" /> Do-not-email list
        </CardTitle>
        <CardDescription>
          Campaigns never email these addresses. Add anyone who replies “unsubscribe” or “stop”.
          Addresses that hard-bounce are added automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste one or more email addresses"
          />
          <Button type="submit" variant="outline" disabled={!input.trim()}>
            Add
          </Button>
        </form>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">The list is empty.</p>
        ) : (
          <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {list.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{s.email}</span>
                <Badge variant="outline" className="text-[11px]">
                  {s.reason}
                </Badge>
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {relativeTime(s.createdAt)}
                </span>
                <button
                  onClick={() => remove(s.email)}
                  aria-label={`Remove ${s.email}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

type ImapDraft = NonNullable<SenderInput["imap"]>;

/** IMAP settings: lets LeadFinder read the inbox to spot replies, unsubscribes and bounces. */
function ReplyTrackingFields({
  imap,
  hasSavedPassword,
  onChange,
}: {
  imap: ImapDraft;
  hasSavedPassword: boolean;
  onChange: (imap: ImapDraft) => void;
}) {
  const set = <K extends keyof ImapDraft>(key: K, value: ImapDraft[K]) => onChange({ ...imap, [key]: value });
  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Reply tracking</p>
          <p className="text-xs text-muted-foreground">
            Reads this mailbox's inbox (IMAP) every few minutes. Replies are logged on the lead and stop follow-ups; “unsubscribe” replies
            and bounces go on the do-not-email list.
          </p>
        </div>
        <Switch checked={imap.enabled} onCheckedChange={(v) => set("enabled", v)} />
      </div>
      {imap.enabled && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
          <div className="space-y-1.5">
            <Label htmlFor="imap-host">IMAP server</Label>
            <Input id="imap-host" value={imap.host} onChange={(e) => set("host", e.target.value)} placeholder="Worked out from the SMTP server" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="imap-port">Port</Label>
            <Input id="imap-port" type="number" value={imap.port} onChange={(e) => set("port", Number(e.target.value) || 993)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="imap-user">Username</Label>
            <Input id="imap-user" value={imap.username} onChange={(e) => set("username", e.target.value)} placeholder="Same as SMTP" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="imap-pass">Password</Label>
            <Input
              id="imap-pass"
              type="password"
              autoComplete="new-password"
              value={imap.password ?? ""}
              onChange={(e) => set("password", e.target.value)}
              placeholder={hasSavedPassword ? "Saved — leave empty to keep" : "Same as SMTP"}
            />
          </div>
          <p className="text-[11px] text-muted-foreground sm:col-span-2">
            Gmail, Outlook, Zoho and Yahoo use the same login (or app password) for sending and reading — leave these empty. In Gmail,
            make sure IMAP is enabled (Settings → Forwarding and POP/IMAP).
          </p>
        </div>
      )}
    </div>
  );
}
