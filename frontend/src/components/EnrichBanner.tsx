import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { queryKeys, useEnrichJob, useInvalidateData } from "@/hooks/queries";
import { api } from "@/lib/api";
import { formatNumber } from "@/utils/format";

/** Live progress of the "check websites & Google data" job; refreshes leads when it finishes. */
export function EnrichBanner() {
  const qc = useQueryClient();
  const invalidateData = useInvalidateData();
  const { data: job } = useEnrichJob();
  const wasRunning = useRef(false);

  useEffect(() => {
    if (job?.status === "running") wasRunning.current = true;
    else if (wasRunning.current && job) {
      wasRunning.current = false;
      void invalidateData();
      if (job.status === "completed") toast.success(job.statusText);
      else if (job.status === "failed") toast.error(job.statusText);
    }
  }, [job, invalidateData]);

  if (job?.status !== "running") return null;
  const pct = job.total ? (job.done / job.total) * 100 : 0;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 font-medium">
          <Sparkles className="h-3.5 w-3.5" /> {job.statusText}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <Progress value={pct} className="h-1.5 max-w-sm" />
          <span className="text-xs text-muted-foreground">
            {formatNumber(job.done)} / {formatNumber(job.total)} · {formatNumber(job.updated)} leads
            updated · {job.emailsFound} new emails
          </span>
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          await api.cancelEnrich().catch(() => undefined);
          void qc.invalidateQueries({ queryKey: queryKeys.enrich });
        }}
      >
        <X className="h-4 w-4" /> Stop
      </Button>
    </div>
  );
}
