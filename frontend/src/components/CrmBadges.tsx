import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { LeadPriority, LeadStage } from "@/types";

export const STAGES: { value: LeadStage; label: string; className: string; dot: string }[] = [
  {
    value: "new",
    label: "New",
    className: "border-border bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  {
    value: "contacted",
    label: "Contacted",
    className: "border-primary/30 bg-primary/10 text-primary",
    dot: "bg-primary",
  },
  {
    value: "qualified",
    label: "Qualified",
    className: "border-chart-4/30 bg-chart-4/10 text-chart-4",
    dot: "bg-chart-4",
  },
  {
    value: "proposal",
    label: "Proposal",
    className: "border-warning/40 bg-warning/10 text-warning-foreground",
    dot: "bg-warning",
  },
  {
    value: "won",
    label: "Won",
    className: "border-success/30 bg-success/10 text-success",
    dot: "bg-success",
  },
  {
    value: "lost",
    label: "Lost",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
];

export const stageMeta = (stage: LeadStage) => STAGES.find((s) => s.value === stage) ?? STAGES[0]!;

export function StageBadge({ stage, className }: { stage: LeadStage; className?: string }) {
  const meta = stageMeta(stage);
  return (
    <Badge variant="outline" className={cn(meta.className, className)}>
      {meta.label}
    </Badge>
  );
}

export function StageSelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: LeadStage;
  onChange: (stage: LeadStage) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as LeadStage)}
      disabled={disabled ?? false}
    >
      <SelectTrigger className={cn("w-40", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STAGES.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            <span className={`h-2 w-2 rounded-full ${s.dot}`} /> {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export const PRIORITIES: { value: LeadPriority; label: string; className: string }[] = [
  {
    value: "high",
    label: "High",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  {
    value: "medium",
    label: "Medium",
    className: "border-warning/40 bg-warning/10 text-warning-foreground",
  },
  { value: "low", label: "Low", className: "border-border bg-muted text-muted-foreground" },
];

export function PriorityBadge({ priority }: { priority: LeadPriority }) {
  const meta = PRIORITIES.find((p) => p.value === priority) ?? PRIORITIES[1]!;
  return (
    <Badge variant="outline" className={meta.className}>
      {meta.label}
    </Badge>
  );
}

/** Data-completeness score (0–100) as a small colored pill. */
export function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 75
      ? "bg-success/10 text-success"
      : score >= 45
        ? "bg-warning/15 text-warning-foreground"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex h-6 min-w-9 items-center justify-center rounded-full px-2 text-xs font-semibold tabular-nums ${tone}`}
      title="Lead score: how complete this lead's contact data is"
    >
      {score}
    </span>
  );
}

export function TagChips({ tags, max = 3 }: { tags: string[]; max?: number }) {
  if (!tags.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.slice(0, max).map((t) => (
        <Badge key={t} variant="secondary" className="px-1.5 py-0 text-[11px] font-medium">
          {t}
        </Badge>
      ))}
      {tags.length > max && (
        <span className="text-[11px] text-muted-foreground">+{tags.length - max}</span>
      )}
    </span>
  );
}
