import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryKeys, useSettings, useTemplates } from "@/hooks/queries";
import { api } from "@/lib/api";
import type { SearchRecord } from "@/types";

const DEFAULT = "__default__";

/** Admin: the WhatsApp message staff send to this campaign's leads, with a live preview. */
export function SearchWhatsAppDialog({
  search,
  onClose,
}: {
  search: SearchRecord | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { settings } = useSettings();
  const { data: templates = [] } = useTemplates();
  const waTemplates = templates.filter((t) => t.channel === "whatsapp");
  const [choice, setChoice] = useState(DEFAULT);
  const [preview, setPreview] = useState<{ text: string; lead: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (search) setChoice(search.whatsappTemplateId ?? DEFAULT);
  }, [search]);

  const fallback = waTemplates.find((t) => t.id === settings.defaultWhatsappTemplateId);
  const chosen = choice === DEFAULT ? fallback : waTemplates.find((t) => t.id === choice);

  // Preview on a real lead from this search.
  useEffect(() => {
    if (!search || !chosen) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    void api.listLeads({ searchId: search.id, limit: 1, page: 1 }).then(async ({ items }) => {
      const lead = items[0];
      if (!lead || cancelled) return;
      const r = await api.renderWhatsApp(lead.id, chosen.body);
      if (!cancelled) setPreview({ text: r.text, lead: lead.businessName });
    });
    return () => {
      cancelled = true;
    };
  }, [search, chosen]);

  async function save() {
    if (!search) return;
    setSaving(true);
    try {
      await api.setSearchWhatsapp(search.id, choice === DEFAULT ? null : choice);
      toast.success(
        choice === DEFAULT
          ? "This campaign now uses the default message."
          : `Staff will send “${chosen?.name}” to this campaign.`,
      );
      void qc.invalidateQueries({ queryKey: queryKeys.searches });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!search} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <MessageCircle className="h-5 w-5 text-success" /> WhatsApp message for this campaign
          </DialogTitle>
          <DialogDescription>
            Staff working “{search?.name}” will send this message. It's personalised for every
            business and they see it before opening WhatsApp.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Message</Label>
            <Select value={choice} onValueChange={setChoice}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT}>
                  Default message{fallback ? ` (${fallback.name})` : " — none set"}
                </SelectItem>
                {waTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Write or edit messages on the{" "}
              <Link to="/templates" className="underline" onClick={onClose}>
                Templates
              </Link>{" "}
              page (WhatsApp tab). The default is set in Settings.
            </p>
          </div>
          {chosen ? (
            <div className="rounded-lg bg-success/5 p-3 text-sm">
              <p className="mb-1 text-xs text-muted-foreground">
                {preview ? `Preview for ${preview.lead}` : "Preview"}
              </p>
              <p className="whitespace-pre-wrap">{preview?.text ?? chosen.body}</p>
            </div>
          ) : (
            <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
              No message chosen and no default set — staff won't be able to send WhatsApp messages
              to these leads until you pick one.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
