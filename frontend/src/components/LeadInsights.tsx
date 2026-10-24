import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  Facebook,
  Flame,
  Globe,
  Instagram,
  Linkedin,
  Loader2,
  MessageCircle,
  Music2,
  RefreshCw,
  Star,
  Twitter,
  XCircle,
  Youtube,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { queryKeys, useInvalidateData } from "@/hooks/queries";
import { api } from "@/lib/api";
import { formatNumber, relativeTime } from "@/utils/format";
import type { Lead, SocialNetwork } from "@/types";

/** Opportunity score pill: hotter colour = better prospect. Hover shows the reasons. */
export function OpportunityBadge({
  lead,
}: {
  lead: Pick<Lead, "opportunity" | "opportunityReasons">;
}) {
  const score = lead.opportunity ?? 0;
  const tone =
    score >= 60
      ? "bg-destructive/10 text-destructive"
      : score >= 35
        ? "bg-warning/15 text-warning-foreground"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-semibold tabular-nums ${tone}`}
      title={
        lead.opportunityReasons?.length
          ? `Opportunity: ${lead.opportunityReasons.join(" · ")}`
          : "Opportunity score"
      }
    >
      <Flame className="h-3 w-3" /> {score}
    </span>
  );
}

export function RatingBadge({
  rating,
  reviews,
}: {
  rating: number | null | undefined;
  reviews: number | null | undefined;
}) {
  if (rating == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap text-sm"
      title={`${rating} stars from ${reviews ?? 0} Google reviews`}
    >
      <Star className="h-3.5 w-3.5 fill-warning text-warning" />
      <span className="font-medium">{rating.toFixed(1)}</span>
      {reviews != null && (
        <span className="text-xs text-muted-foreground">({formatNumber(reviews)})</span>
      )}
    </span>
  );
}

const SOCIAL_ICONS: Record<SocialNetwork, { icon: LucideIcon; label: string }> = {
  facebook: { icon: Facebook, label: "Facebook" },
  instagram: { icon: Instagram, label: "Instagram" },
  linkedin: { icon: Linkedin, label: "LinkedIn" },
  twitter: { icon: Twitter, label: "X / Twitter" },
  youtube: { icon: Youtube, label: "YouTube" },
  tiktok: { icon: Music2, label: "TikTok" },
  whatsapp: { icon: MessageCircle, label: "WhatsApp" },
};

export function SocialLinks({ socials }: { socials: Lead["socials"] }) {
  const entries = Object.entries(socials ?? {}).filter(([, url]) => url) as [
    SocialNetwork,
    string,
  ][];
  if (!entries.length)
    return <p className="text-sm text-muted-foreground">None found on the website.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([network, url]) => {
        const meta = SOCIAL_ICONS[network] ?? { icon: Globe, label: network };
        return (
          <a
            key={network}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:border-primary hover:text-primary"
          >
            <meta.icon className="h-3.5 w-3.5" /> {meta.label}
          </a>
        );
      })}
    </div>
  );
}

function Check({ ok, label }: { ok: boolean | undefined; label: string }) {
  if (ok === undefined) return null;
  return (
    <li className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-success" />
      ) : (
        <XCircle className="h-4 w-4 text-destructive" />
      )}
      {label}
    </li>
  );
}

/** Opportunity, Google data and website check for one lead, with a "Re-check" button. */
export function InsightsCard({ lead }: { lead: Lead }) {
  const qc = useQueryClient();
  const invalidateData = useInvalidateData();
  const [busy, setBusy] = useState(false);
  const audit = lead.audit;

  async function recheck() {
    setBusy(true);
    try {
      await api.startEnrich({ ids: [lead.id], onlyMissing: false });
      toast.info("Checking the website and Google profile…");
      // Poll until this one-lead job finishes, then refresh.
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const job = await api.enrichStatus();
        if (job && job.status !== "running") {
          toast.success(job.statusText);
          break;
        }
      }
      void invalidateData();
      void qc.invalidateQueries({ queryKey: queryKeys.enrich });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the check.");
    } finally {
      setBusy(false);
    }
  }

  const year = new Date().getFullYear();
  return (
    <Card className="card-shadow rounded-xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-display text-base font-semibold">Insights</CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={recheck}
          disabled={busy || (!lead.website && !lead.sourceUrl)}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{" "}
          Re-check
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <div className="flex items-center gap-2">
            <OpportunityBadge lead={lead} />
            <span className="text-xs text-muted-foreground">
              opportunity for web & marketing services
            </span>
          </div>
          {!!lead.opportunityReasons?.length && (
            <ul className="mt-2 flex flex-wrap gap-1">
              {lead.opportunityReasons.map((r) => (
                <li key={r}>
                  <Badge variant="secondary" className="font-normal">
                    {r}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-1 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">Google</p>
          {lead.rating != null || lead.businessStatus ? (
            <div className="flex flex-wrap items-center gap-3">
              <RatingBadge rating={lead.rating} reviews={lead.reviewCount} />
              {lead.businessStatus && lead.businessStatus !== "open" && (
                <Badge
                  variant="outline"
                  className="border-destructive/30 bg-destructive/10 text-destructive"
                >
                  {lead.businessStatus === "closed_permanently"
                    ? "Permanently closed"
                    : "Temporarily closed"}
                </Badge>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">No rating yet — press Re-check.</p>
          )}
        </div>

        <div className="space-y-1.5 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">
            Website check{audit?.checkedAt && ` · ${relativeTime(audit.checkedAt)}`}
          </p>
          {!lead.website ? (
            <p className="font-medium text-destructive">
              No website — a prime web design prospect.
            </p>
          ) : !audit ? (
            <p className="text-muted-foreground">Not checked yet — press Re-check.</p>
          ) : !audit.reachable ? (
            <p className="font-medium text-destructive">
              Website not working{audit.error ? ` (${audit.error})` : ""}.
            </p>
          ) : (
            <ul className="space-y-1">
              <Check
                ok={audit.https}
                label={audit.https ? "Secure (HTTPS)" : "No HTTPS — browsers show “Not secure”"}
              />
              <Check
                ok={audit.mobileFriendly}
                label={audit.mobileFriendly ? "Mobile-friendly" : "Not mobile-friendly"}
              />
              {audit.loadMs != null && (
                <Check
                  ok={audit.loadMs <= 4000}
                  label={`Loads in ${(audit.loadMs / 1000).toFixed(1)} s`}
                />
              )}
              {audit.copyrightYear != null && (
                <Check
                  ok={audit.copyrightYear > year - 3}
                  label={`Last updated ${audit.copyrightYear} (footer ©)`}
                />
              )}
              {audit.platform && (
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Globe className="h-4 w-4" /> Built with {audit.platform}
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="space-y-1.5 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">Social profiles</p>
          <SocialLinks socials={lead.socials} />
        </div>
      </CardContent>
    </Card>
  );
}
