import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Loader2, MoreHorizontal, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
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
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  EmailEditor,
  STARTER_TEMPLATES,
  WHATSAPP_STARTER_TEMPLATES,
} from "@/components/EmailEditor";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/EmptyState";
import { queryKeys, useAuth, useTemplates } from "@/hooks/queries";
import { ApiError, api } from "@/lib/api";
import { relativeTime } from "@/utils/format";
import type { EmailTemplate } from "@/types";

export const Route = createFileRoute("/templates")({
  head: () => ({
    meta: [
      { title: "Templates — LeadFinder Pro" },
      {
        name: "description",
        content: "Reusable email and WhatsApp messages with personal merge fields.",
      },
    ],
  }),
  component: TemplatesPage,
});

type Channel = "email" | "whatsapp";
type Draft = Pick<EmailTemplate, "name" | "subject" | "body"> & { channel: Channel };

function TemplatesPage() {
  const qc = useQueryClient();
  const { data: templates, isPending } = useTemplates();
  const [editing, setEditing] = useState<{ template: EmailTemplate | null; draft: Draft } | null>(
    null,
  );
  const [toDelete, setToDelete] = useState<EmailTemplate | null>(null);
  const [channel, setChannel] = useState<Channel>("email");
  const { isAdmin } = useAuth();
  // Only admins write WhatsApp messages; staff can read them.
  const readOnly = channel === "whatsapp" && !isAdmin;
  const visible = (templates ?? []).filter((t) => (t.channel ?? "email") === channel);
  const starters =
    channel === "email"
      ? STARTER_TEMPLATES
      : WHATSAPP_STARTER_TEMPLATES.map((t) => ({ ...t, subject: "" }));
  const asDraft = (t: EmailTemplate): Draft => ({ ...t, channel: t.channel ?? "email" });

  const startNew = (draft: Omit<Draft, "channel"> = { name: "", subject: "", body: "" }) =>
    setEditing({ template: null, draft: { ...draft, channel } });

  async function remove() {
    if (!toDelete) return;
    try {
      await api.deleteTemplate(toDelete.id);
      toast.success("Template deleted.");
      void qc.invalidateQueries({ queryKey: queryKeys.templates });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setToDelete(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold">Templates</h2>
          <p className="text-sm text-muted-foreground">
            Write a message once and reuse it in email campaigns and WhatsApp outreach. Merge fields
            personalise it for every business.
          </p>
        </div>
        <Button
          onClick={() => startNew()}
          disabled={readOnly}
          title={readOnly ? "Only an admin can create WhatsApp messages" : undefined}
        >
          <Plus className="h-4 w-4" /> New template
        </Button>
      </div>

      <Tabs value={channel} onValueChange={(v) => setChannel(v as Channel)}>
        <TabsList>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
        </TabsList>
      </Tabs>

      {isPending ? (
        <div className="flex justify-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : !visible.length ? (
        <EmptyState
          icon={FileText}
          title="No templates yet"
          description="Start from a ready-made template below, or write your own."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {visible.map((t) => (
            <Card
              key={t.id}
              className="card-shadow cursor-pointer rounded-xl transition-colors hover:border-primary/40"
              onClick={() => !readOnly && setEditing({ template: t, draft: asDraft(t) })}
            >
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="truncate font-display text-base font-semibold">
                    {t.name}
                  </CardTitle>
                  <CardDescription className="truncate">
                    {t.subject || "WhatsApp message"}
                  </CardDescription>
                </div>
                <div
                  onClick={(e) => e.stopPropagation()}
                  className={readOnly ? "hidden" : undefined}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Template actions"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => setEditing({ template: t, draft: asDraft(t) })}
                      >
                        <Pencil className="h-4 w-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => startNew({ ...t, name: `${t.name} (copy)` })}
                      >
                        <Plus className="h-4 w-4" /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setToDelete(t)}
                      >
                        <Trash2 className="h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <p className="line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">
                  {t.body}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Edited {relativeTime(t.updatedAt)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!readOnly && (
        <Card className="card-shadow rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display text-base font-semibold">
              <Sparkles className="h-4 w-4 text-primary" /> Ready-made templates
            </CardTitle>
            <CardDescription>Click one to customise it and save it as your own.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {starters.map((t) => (
              <button
                key={t.name}
                onClick={() => startNew(t)}
                className="rounded-lg border border-border p-3 text-left transition-colors hover:border-primary hover:bg-primary/5"
              >
                <p className="text-sm font-medium">{t.name}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {t.subject || t.body.slice(0, 60)}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <TemplateDialog editing={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Delete this template?"
        description="Campaigns that already used it keep their own copy of the email."
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </div>
  );
}

function TemplateDialog({
  editing,
  onClose,
}: {
  editing: { template: EmailTemplate | null; draft: Draft } | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>({ name: "", subject: "", body: "", channel: "email" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setDraft(editing.draft);
      setErrors({});
    }
  }, [editing]);

  async function save() {
    setSaving(true);
    try {
      if (editing?.template) await api.updateTemplate(editing.template.id, draft);
      else await api.createTemplate(draft);
      toast.success("Template saved.");
      void qc.invalidateQueries({ queryKey: queryKeys.templates });
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      toast.error(err instanceof Error ? err.message : "Could not save the template.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!editing} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">
            {editing?.template ? "Edit template" : "New template"}
          </DialogTitle>
          <DialogDescription>
            {draft.channel === "whatsapp"
              ? "A WhatsApp message opens prefilled for each lead — keep it short and friendly."
              : "Your sender signature is added automatically at the end."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="template-name">Template name</Label>
            <Input
              id="template-name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="e.g. Web design intro"
              aria-invalid={!!errors["name"]}
            />
            {errors["name"] && <p className="text-xs text-destructive">{errors["name"]}</p>}
          </div>
          <EmailEditor
            subject={draft.subject}
            body={draft.body}
            errors={errors}
            hideSubject={draft.channel === "whatsapp"}
            showSignatureField={draft.channel !== "whatsapp"}
            rows={draft.channel === "whatsapp" ? 8 : 14}
            onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
