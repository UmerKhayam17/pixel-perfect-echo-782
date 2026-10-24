import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { Campaign, CampaignAudience, CampaignStatus } from "@/types";

const STATUS: Record<CampaignStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "border-border bg-muted text-muted-foreground" },
  sending: { label: "Sending", className: "border-primary/30 bg-primary/10 text-primary" },
  paused: { label: "Paused", className: "border-warning/40 bg-warning/10 text-warning-foreground" },
  completed: { label: "Completed", className: "border-success/30 bg-success/10 text-success" },
  cancelled: { label: "Cancelled", className: "border-border bg-muted text-muted-foreground" },
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <Badge variant="outline" className={STATUS[status].className}>
      {STATUS[status].label}
    </Badge>
  );
}

/** Creates a draft campaign for an audience; used by the "Email" buttons across the app. */
export function createCampaignDraft(audience: CampaignAudience, name?: string): Promise<Campaign> {
  return api.createCampaign({
    name: name ?? `Outreach — ${audience.label}`,
    audience,
    options: { delaySeconds: 45, skipEmailedBefore: true, skipClosed: true },
  });
}
