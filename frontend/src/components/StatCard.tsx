import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string;
  delta?: string | undefined;
  icon: LucideIcon;
  tone?: "primary" | "success" | "warning" | "muted" | undefined;
}

const TONES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning-foreground",
  muted: "bg-muted text-muted-foreground",
};

export function StatCard({ label, value, delta, icon: Icon, tone = "primary" }: StatCardProps) {
  return (
    <Card className="card-shadow gap-0 rounded-xl border-border/80 py-0">
      {/* Phones show two per row, so the icon sits above the text there. */}
      <CardContent className="flex flex-col items-start gap-2.5 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-11 sm:w-11 ${TONES[tone]}`}
        >
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
        <div className="w-full min-w-0">
          <p className="line-clamp-2 text-xs font-medium text-muted-foreground sm:truncate sm:text-[13px]">
            {label}
          </p>
          <p className="truncate font-display text-xl font-bold text-foreground sm:text-2xl">
            {value}
          </p>
          {delta && <p className="line-clamp-2 text-xs text-success">{delta}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
