import { CircleAlert, Globe, MapPinned } from "lucide-react";
import { useHealth } from "@/hooks/queries";

export const SOURCE_LABELS = {
  google_maps: "Google Maps scraper",
  google_places: "Google Places API",
} as const;

/** Live backend status: which lead source new searches will use, or that the API is down. */
export function SourceBadge() {
  const { data, isError, isPending } = useHealth();

  if (isPending) return null;
  if (isError || !data?.db) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
        <CircleAlert className="h-3.5 w-3.5" />
        {isError ? "API offline" : "Database offline"}
      </span>
    );
  }
  const Icon = data.source === "google_places" ? Globe : MapPinned;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-medium text-success">
      <Icon className="h-3.5 w-3.5" />
      {SOURCE_LABELS[data.source]}
    </span>
  );
}
