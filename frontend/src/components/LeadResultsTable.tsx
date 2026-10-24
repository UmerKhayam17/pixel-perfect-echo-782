import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ExternalLink, FileSpreadsheet, FileText, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MissingBadge } from "@/components/StatusBadge";
import { queryKeys, useLeads } from "@/hooks/queries";
import { exportLeads } from "@/lib/exportLeads";
import { DEFAULT_EXPORT_FIELD_KEYS } from "@/utils/exporters";
import { formatNumber } from "@/utils/format";
import type { ExportFormat } from "@/types";

const PAGE_SIZE = 50;

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Link to a business's Google Business Profile (Maps listing). */
export function ProfileLink({ url, label = "Profile" }: { url: string | null | undefined; label?: string }) {
  if (!url) return <span className="text-muted-foreground">—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 whitespace-nowrap text-primary hover:underline"
      title="Open Google Business Profile"
    >
      <MapPin className="h-3.5 w-3.5" /> {label}
    </a>
  );
}

export function WebsiteLink({ url }: { url: string | null | undefined }) {
  if (!url) return <span className="text-muted-foreground">—</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary">
      <span className="max-w-[16rem] truncate">{hostOf(url)}</span> <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}

/** Every lead a search has found so far (including ones already in the database), paged. */
export function LeadResultsTable({ searchId, scope, live }: { searchId: string; scope: string; live: boolean }) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const { data, isPending } = useLeads({ searchId, page, limit: PAGE_SIZE, sort: "oldest" });
  const leads = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function runExport(format: ExportFormat) {
    setExporting(true);
    try {
      const record = await exportLeads({ query: { searchId, sort: "oldest" }, format, fieldKeys: DEFAULT_EXPORT_FIELD_KEYS, scope });
      void qc.invalidateQueries({ queryKey: queryKeys.exports });
      toast.success(`Exported ${formatNumber(record.count)} leads to ${record.filename}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  if (isPending) {
    return <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }
  if (total === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {live ? "Waiting for the first results…" : "This search did not find any businesses."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {formatNumber(total)} businesses{live ? " so far" : ""}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={exporting} onClick={() => runExport("csv")}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} CSV
          </Button>
          <Button size="sm" variant="outline" disabled={exporting} onClick={() => runExport("xlsx")}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pl-3">#</TableHead>
              <TableHead>Business</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Website</TableHead>
              <TableHead>Google profile</TableHead>
              <TableHead className="hidden lg:table-cell">Address</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((l, i) => (
              <TableRow key={l.id}>
                <TableCell className="pl-3 text-xs text-muted-foreground">{(page - 1) * PAGE_SIZE + i + 1}</TableCell>
                <TableCell className="min-w-[12rem]">
                  <p className="font-medium text-foreground">{l.businessName}</p>
                  <p className="text-xs text-muted-foreground">{[l.category, l.city].filter(Boolean).join(" · ")}</p>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {l.phone ? <a href={`tel:${l.phone}`} className="hover:text-primary">{l.phone}</a> : <MissingBadge field="phone" />}
                </TableCell>
                <TableCell>
                  {l.email ? <a href={`mailto:${l.email}`} className="hover:text-primary">{l.email}</a> : <MissingBadge field="email" />}
                </TableCell>
                <TableCell><WebsiteLink url={l.website} /></TableCell>
                <TableCell><ProfileLink url={l.sourceUrl} /></TableCell>
                <TableCell className="hidden min-w-[14rem] max-w-xs whitespace-normal text-xs text-muted-foreground lg:table-cell">{l.address ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <span>Page {page} of {pageCount}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
