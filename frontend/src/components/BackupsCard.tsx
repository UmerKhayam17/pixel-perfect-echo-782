import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DatabaseBackup, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { queryKeys, useBackups } from "@/hooks/queries";
import { api } from "@/lib/api";
import { formatDateTime } from "@/utils/format";

const size = (bytes: number) =>
  bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Settings card: daily database backups (admin only — the API enforces it). */
export function BackupsCard() {
  const qc = useQueryClient();
  const { data, isPending } = useBackups();
  const [busy, setBusy] = useState(false);

  async function backupNow() {
    setBusy(true);
    try {
      const b = await api.createBackup();
      toast.success(`Backup saved: ${b.documents} records.`);
      void qc.invalidateQueries({ queryKey: queryKeys.backups });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Backup failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="card-shadow rounded-xl">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 font-display text-base font-semibold">
            <DatabaseBackup className="h-4 w-4" /> Backups
          </CardTitle>
          <CardDescription>
            {data?.enabled === false
              ? "Automatic backups are turned off (BACKUP_ENABLED=false)."
              : `The whole database is backed up automatically once a day and kept for ${data?.keepDays ?? 14} days.`}
          </CardDescription>
        </div>
        <Button variant="outline" onClick={backupNow} disabled={busy}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <DatabaseBackup className="h-4 w-4" />
          )}{" "}
          Back up now
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isPending ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : !data?.backups.length ? (
          <p className="text-sm text-muted-foreground">No backups yet.</p>
        ) : (
          <ul className="max-h-60 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {data.backups.map((b) => (
              <li key={b.file} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="flex-1">{formatDateTime(b.createdAt)}</span>
                <span className="text-xs text-muted-foreground">{size(b.size)}</span>
                <Button asChild variant="ghost" size="sm" className="h-7">
                  <a href={api.downloadBackupUrl(b.file)} download>
                    <Download className="h-3.5 w-3.5" /> Download
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Saved in <code className="rounded bg-muted px-1">{data?.dir ?? "backend/backups"}</code>.
          To restore, stop the API and run{" "}
          <code className="rounded bg-muted px-1">npm run restore</code> in the backend folder. Keep
          a copy somewhere else too (e.g. Google Drive), together with{" "}
          <code className="rounded bg-muted px-1">backend/.app-secret</code>.
        </p>
      </CardContent>
    </Card>
  );
}
