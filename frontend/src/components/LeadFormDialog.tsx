import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CountryCombobox } from "@/components/CountryCombobox";
import { PRIORITIES, StageSelect } from "@/components/CrmBadges";
import { TagInput } from "@/components/TagInput";
import { useInvalidateData, useSettings } from "@/hooks/queries";
import { ApiError, api } from "@/lib/api";
import type { Lead, LeadInput, LeadPriority } from "@/types";

type Draft = Required<Omit<LeadInput, "dealValue" | "assignedTo" | "pinned" | "whatsappStatus">> & {
  dealValue: string;
};

function toDraft(lead: Lead | null, defaultCountry: string): Draft {
  return {
    businessName: lead?.businessName ?? "",
    category: lead?.category ?? "",
    country: lead?.country ?? defaultCountry,
    city: lead?.city ?? "",
    address: lead?.address ?? "",
    phone: lead?.phone ?? "",
    email: lead?.email ?? "",
    website: lead?.website ?? "",
    contactName: lead?.contactName ?? "",
    contactRole: lead?.contactRole ?? "",
    dealValue: lead?.dealValue != null ? String(lead.dealValue) : "",
    priority: lead?.priority ?? "medium",
    stage: lead?.stage ?? "new",
    tags: lead?.tags ?? [],
  };
}

/** Add a lead by hand (lead = null) or edit an existing one. */
export function LeadFormDialog({
  open,
  onOpenChange,
  lead,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  onSaved?: (lead: Lead) => void;
}) {
  const { settings } = useSettings();
  const invalidateData = useInvalidateData();
  const [draft, setDraft] = useState<Draft>(() => toDraft(lead, settings.defaultCountry));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(toDraft(lead, settings.defaultCountry));
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead?.id]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function save() {
    setSaving(true);
    try {
      const { dealValue, stage, ...rest } = draft;
      const input: LeadInput = {
        ...rest,
        dealValue: dealValue.trim() === "" ? null : Number(dealValue),
      };
      // Stage changes on existing leads go through the stage picker so they're logged once.
      const saved = lead
        ? await api.updateLead(lead.id, input)
        : await api.createLead({ ...input, stage });
      toast.success(lead ? "Lead updated." : "Lead added.");
      void invalidateData();
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      toast.error(err instanceof Error ? err.message : "Could not save the lead.");
    } finally {
      setSaving(false);
    }
  }

  const field = (
    key: keyof Draft,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`lead-${key}`}>{label}</Label>
      <Input
        id={`lead-${key}`}
        value={draft[key] as string}
        onChange={(e) => set(key, e.target.value as never)}
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
          <DialogTitle className="font-display">{lead ? "Edit lead" : "Add a lead"}</DialogTitle>
          <DialogDescription>
            {lead
              ? "Correct contact details or update deal information."
              : "Add a business you found outside LeadFinder."}
          </DialogDescription>
        </DialogHeader>

        <form
          id="lead-form"
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field("businessName", "Business name *", { autoFocus: !lead })}
            {field("category", "Category", { placeholder: "e.g. Dentist" })}
            <div className="space-y-1.5">
              <Label>Country</Label>
              <CountryCombobox value={draft.country} onChange={(v) => set("country", v)} />
            </div>
            {field("city", "City")}
            <div className="sm:col-span-2">{field("address", "Address")}</div>
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
            {field("contactName", "Contact person")}
            {field("contactRole", "Role", { placeholder: "e.g. Owner" })}
            {field("phone", "Phone", { type: "tel" })}
            {field("email", "Email", { type: "email" })}
            <div className="sm:col-span-2">
              {field("website", "Website", { placeholder: "https://…" })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-3">
            {field("dealValue", `Deal value (${settings.currency})`, {
              type: "number",
              min: 0,
              step: "any",
            })}
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={draft.priority}
                onValueChange={(v) => set("priority", v as LeadPriority)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!lead && (
              <div className="space-y-1.5">
                <Label>Stage</Label>
                <StageSelect
                  value={draft.stage}
                  onChange={(v) => set("stage", v)}
                  className="w-full"
                />
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-3">
              <Label>Tags</Label>
              <TagInput value={draft.tags} onChange={(t) => set("tags", t)} />
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="lead-form" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {lead ? "Save changes" : "Add lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
