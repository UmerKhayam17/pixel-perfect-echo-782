import type { SearchStatus } from "@/types";
import { Badge } from "@/components/ui/badge";

export function SearchStatusBadge({ status }: { status: SearchStatus }) {
  const map: Record<SearchStatus, { label: string; className: string }> = {
    completed: { label: "Completed", className: "border-success/30 bg-success/10 text-success" },
    running: { label: "Running", className: "border-primary/30 bg-primary/10 text-primary" },
    paused: { label: "Paused", className: "border-warning/40 bg-warning/10 text-warning-foreground" },
    cancelled: { label: "Cancelled", className: "border-border bg-muted text-muted-foreground" },
  };
  const { label, className } = map[status];
  return <Badge variant="outline" className={className}>{label}</Badge>;
}

export function MissingBadge({ field }: { field: "phone" | "email" }) {
  return (
    <Badge variant="outline" className="border-destructive/25 bg-destructive/5 text-destructive">
      No {field}
    </Badge>
  );
}
