import { Flag, MessageCircle, Phone, Pin, PinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PRIORITIES, PriorityBadge } from "@/components/CrmBadges";
import { relativeTime } from "@/utils/format";
import { Badge } from "@/components/ui/badge";
import type { Lead, LeadPriority, WhatsAppStatus } from "@/types";

/** The priority badge, clickable to change it. */
export function PriorityMenu({
  priority,
  onChange,
}: {
  priority: LeadPriority;
  onChange: (priority: LeadPriority) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Change priority"
      >
        <PriorityBadge priority={priority} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Priority</DropdownMenuLabel>
        {PRIORITIES.map((p) => (
          <DropdownMenuItem
            key={p.value}
            disabled={p.value === priority}
            onClick={() => onChange(p.value)}
          >
            <Flag className="h-4 w-4" /> {p.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Pin / unpin a lead: pinned leads stay at the top of the list and the pipeline. */
export function PinButton({ pinned, onToggle }: { pinned: boolean; onToggle: () => void }) {
  return (
    <Button variant={pinned ? "secondary" : "outline"} onClick={onToggle} aria-pressed={pinned}>
      {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
      {pinned ? "Unpin" : "Pin"}
    </Button>
  );
}

/** Small marker shown beside a pinned lead's name. */
export function PinnedMark({ pinned }: { pinned?: boolean | undefined }) {
  if (!pinned) return null;
  return (
    <Pin className="inline h-3.5 w-3.5 shrink-0 fill-primary text-primary" aria-label="Pinned" />
  );
}

const WORK_VERBS: Record<string, string> = {
  call: "called",
  email: "emailed",
  whatsapp: "messaged on WhatsApp",
  whatsapp_unavailable: "found it's not on WhatsApp",
  meeting: "met",
  note: "added a note",
  email_reply: "got an email reply",
  stage_change: "moved the stage",
};

/** Who owns a lead, who last worked on it and who has open tasks on it. */
export function WorkInfo({
  lead,
  owner,
  showOwner = true,
}: {
  lead: Lead;
  owner: string | null;
  showOwner?: boolean;
}) {
  const last = lead.lastActivity;
  return (
    <div className="min-w-0 space-y-0.5 text-xs">
      {showOwner && (
        <p className="truncate text-sm text-foreground">
          {owner ?? <span className="text-muted-foreground">Unassigned</span>}
        </p>
      )}
      {last && (
        <p className="truncate text-muted-foreground" title={new Date(last.date).toLocaleString()}>
          {last.by} {WORK_VERBS[last.type] ?? "updated it"} · {relativeTime(last.date)}
        </p>
      )}
      {lead.openTasks && (
        <p className="truncate text-primary">
          {lead.openTasks.count} open task{lead.openTasks.count === 1 ? "" : "s"}
          {lead.openTasks.assignees.length ? ` · ${lead.openTasks.assignees.join(", ")}` : ""}
        </p>
      )}
    </div>
  );
}

/**
 * Whether the lead's number is on WhatsApp: known once someone tried it, otherwise a hint from
 * the number itself (landlines almost never have WhatsApp).
 */
export function WhatsAppBadge({ lead, compact = false }: { lead: Lead; compact?: boolean }) {
  const status = lead.whatsappStatus ?? "unknown";
  if (status === "yes") {
    return (
      <Badge variant="outline" className="gap-1 border-success/30 bg-success/10 text-success">
        <MessageCircle className="h-3 w-3" /> {compact ? "WA" : "On WhatsApp"}
      </Badge>
    );
  }
  if (status === "no") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-destructive/30 bg-destructive/10 text-destructive"
      >
        <MessageCircle className="h-3 w-3" /> {compact ? "No WA" : "Not on WhatsApp"}
      </Badge>
    );
  }
  if (lead.phoneType === "landline") {
    return (
      <Badge
        variant="outline"
        className="gap-1 text-muted-foreground"
        title="Landlines almost never have WhatsApp"
      >
        <Phone className="h-3 w-3" /> Landline
      </Badge>
    );
  }
  return null;
}

const WA_OPTIONS: { value: WhatsAppStatus; label: string }[] = [
  { value: "yes", label: "On WhatsApp" },
  { value: "no", label: "Not on WhatsApp" },
  { value: "unknown", label: "Not checked yet" },
];

/** The WhatsApp badge (or a "WhatsApp?" chip), clickable to set the status by hand. */
export function WhatsAppStatusMenu({
  lead,
  onChange,
}: {
  lead: Lead;
  onChange: (status: WhatsAppStatus) => void;
}) {
  const status = lead.whatsappStatus ?? "unknown";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Set WhatsApp status"
      >
        {WhatsAppBadge({ lead }) ?? (
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <MessageCircle className="h-3 w-3" /> WhatsApp?
          </Badge>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {lead.whatsappCheckedBy && lead.whatsappCheckedAt
            ? `Checked by ${lead.whatsappCheckedBy} ${relativeTime(lead.whatsappCheckedAt)}`
            : "WhatsApp"}
        </DropdownMenuLabel>
        {WA_OPTIONS.map((o) => (
          <DropdownMenuItem
            key={o.value}
            disabled={o.value === status}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
