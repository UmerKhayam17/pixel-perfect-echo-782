import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileDown, FileSpreadsheet, FileText, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { queryKeys, useExports, useLeadFacets, useLeads, useSearches } from "@/hooks/queries";
import { api } from "@/lib/api";
import { exportFilename, exportLeads } from "@/lib/exportLeads";
import { DEFAULT_EXPORT_FIELD_KEYS, LEAD_FIELDS } from "@/utils/exporters";
import { formatDateTime, formatNumber } from "@/utils/format";
import type { ContactType, ExportFormat, LeadQuery } from "@/types";
import { RequirePermission } from "@/components/RequirePermission";

export const Route = createFileRoute("/export-center")({
  head: () => ({
    meta: [
      { title: "Export Center — LeadFinder Pro" },
      {
        name: "description",
        content: "Export collected leads to CSV or Excel and review past exports.",
      },
    ],
  }),
  component: () => (
    <RequirePermission permission="export">
      <ExportCenterPage />
    </RequirePermission>
  ),
});

type ScopeKind = "all" | "search" | "country";

function ExportCenterPage() {
  const qc = useQueryClient();
  const { data: searches } = useSearches();
  const { data: facets } = useLeadFacets();
  const { data: exports, isPending: exportsPending } = useExports();

  const [scopeKind, setScopeKind] = useState<ScopeKind>("all");
  const [searchId, setSearchId] = useState<string>("");
  const [country, setCountry] = useState<string>("");
  const [requireContacts, setRequireContacts] = useState<ContactType[]>([]);
  const [fieldKeys, setFieldKeys] = useState<string[]>(DEFAULT_EXPORT_FIELD_KEYS);
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [filename, setFilename] = useState("");
  const [exporting, setExporting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const searchesWithLeads = (searches ?? []).filter((s) => s.leadsFound > 0);
  const query: LeadQuery = {
    searchId: scopeKind === "search" ? searchId || undefined : undefined,
    country: scopeKind === "country" ? country || undefined : undefined,
    has: requireContacts,
  };
  const scopeIncomplete =
    (scopeKind === "search" && !searchId) || (scopeKind === "country" && !country);
  // A one-row page is enough to learn how many leads the export will contain.
  const { data: preview, isFetching: counting } = useLeads({ ...query, limit: 1 });
  const count = scopeIncomplete ? 0 : (preview?.total ?? 0);

  const scopeLabel =
    scopeKind === "search"
      ? (searches?.find((s) => s.id === searchId)?.name ?? "Search")
      : scopeKind === "country"
        ? `Leads in ${country}`
        : "All leads";
  const scopeWithFilters = requireContacts.length
    ? `${scopeLabel} (with ${requireContacts.join(" + ")})`
    : scopeLabel;

  const toggle = <T,>(list: T[], value: T, on: boolean) =>
    on ? [...list, value] : list.filter((v) => v !== value);

  async function runExport() {
    if (fieldKeys.length === 0) {
      toast.error("Choose at least one field to export.");
      return;
    }
    setExporting(true);
    try {
      const record = await exportLeads({
        query,
        format,
        fieldKeys,
        scope: scopeWithFilters,
        filename: filename && `${filename.replace(/\.(csv|xlsx)$/i, "")}.${format}`,
      });
      toast.success(`Exported ${formatNumber(record.count)} leads to ${record.filename}.`);
      void qc.invalidateQueries({ queryKey: queryKeys.exports });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  async function removeExport(id: string) {
    try {
      await api.deleteExport(id);
      void qc.invalidateQueries({ queryKey: queryKeys.exports });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the record.");
    }
  }

  async function clearHistory() {
    try {
      await api.clearExports();
      void qc.invalidateQueries({ queryKey: queryKeys.exports });
      toast.success("Export history cleared.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear history.");
    } finally {
      setConfirmClear(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="card-shadow rounded-xl">
        <CardHeader>
          <CardTitle className="font-display text-base font-semibold">New export</CardTitle>
          <CardDescription>
            Choose which leads and fields to include. Files download straight to your computer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Scope */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Leads to export</Label>
            <RadioGroup
              value={scopeKind}
              onValueChange={(v) => setScopeKind(v as ScopeKind)}
              className="gap-2"
            >
              <Label className="flex items-center gap-2 font-normal">
                <RadioGroupItem value="all" /> All leads
              </Label>
              <Label className="flex items-center gap-2 font-normal">
                <RadioGroupItem value="search" /> Leads from one search
              </Label>
              {scopeKind === "search" && (
                <Select value={searchId} onValueChange={setSearchId}>
                  <SelectTrigger className="ml-6 w-[calc(100%-1.5rem)]">
                    <SelectValue placeholder="Choose a search" />
                  </SelectTrigger>
                  <SelectContent>
                    {searchesWithLeads.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} · {formatNumber(s.leadsFound)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Label className="flex items-center gap-2 font-normal">
                <RadioGroupItem value="country" /> Leads in one country
              </Label>
              {scopeKind === "country" && (
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger className="ml-6 w-[calc(100%-1.5rem)]">
                    <SelectValue placeholder="Choose a country" />
                  </SelectTrigger>
                  <SelectContent>
                    {facets?.countries.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </RadioGroup>
            <div className="flex flex-wrap gap-4 pt-1">
              {(["phone", "email", "website"] as const).map((c) => (
                <Label key={c} className="flex items-center gap-2 text-sm font-normal">
                  <Checkbox
                    checked={requireContacts.includes(c)}
                    onCheckedChange={(v) => setRequireContacts((l) => toggle(l, c, v === true))}
                  />
                  Must have {c}
                </Label>
              ))}
            </div>
          </div>

          {/* Fields */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Fields</Label>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setFieldKeys(LEAD_FIELDS.map((f) => f.key))}
                >
                  All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setFieldKeys(DEFAULT_EXPORT_FIELD_KEYS)}
                >
                  Default
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {LEAD_FIELDS.map((f) => (
                <Label key={f.key} className="flex items-center gap-2 text-sm font-normal">
                  <Checkbox
                    checked={fieldKeys.includes(f.key)}
                    onCheckedChange={(v) => setFieldKeys((l) => toggle(l, f.key, v === true))}
                  />
                  {f.label}
                </Label>
              ))}
            </div>
          </div>

          {/* Format + name */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Format</Label>
              <RadioGroup
                value={format}
                onValueChange={(v) => setFormat(v as ExportFormat)}
                className="flex gap-4"
              >
                <Label className="flex items-center gap-2 font-normal">
                  <RadioGroupItem value="csv" /> <FileText className="h-4 w-4" /> CSV
                </Label>
                <Label className="flex items-center gap-2 font-normal">
                  <RadioGroupItem value="xlsx" /> <FileSpreadsheet className="h-4 w-4" /> Excel
                </Label>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label htmlFor="filename" className="text-sm font-semibold">
                File name <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="filename"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder={exportFilename(scopeLabel, format)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <Button
              size="lg"
              onClick={runExport}
              disabled={exporting || scopeIncomplete || count === 0}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Export {scopeIncomplete ? "" : formatNumber(count)} leads
            </Button>
            <span className="text-sm text-muted-foreground">
              {counting
                ? "Counting…"
                : scopeIncomplete
                  ? "Choose what to export."
                  : count === 0
                    ? "No leads match this selection."
                    : ""}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="card-shadow rounded-xl">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="font-display text-base font-semibold">Export history</CardTitle>
            <CardDescription>Files you have generated</CardDescription>
          </div>
          {!!exports?.length && (
            <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)}>
              Clear
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {exportsPending ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : !exports?.length ? (
            <EmptyState
              icon={FileDown}
              title="No exports yet"
              description="Exports you create here or from All Leads appear in this list."
              action={
                <Button asChild variant="outline">
                  <Link to="/leads">Browse leads</Link>
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead className="hidden sm:table-cell">Created</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exports.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <p className="flex max-w-[55vw] items-center gap-1.5 font-medium sm:max-w-md">
                          {e.format === "csv" ? (
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <FileSpreadsheet className="h-4 w-4 shrink-0 text-success" />
                          )}
                          <span className="truncate">{e.filename}</span>
                        </p>
                        <p
                          className="max-w-[55vw] truncate text-xs text-muted-foreground sm:max-w-md"
                          title={e.fields.join(", ")}
                        >
                          {e.scope} · {e.fields.length} fields
                        </p>
                      </TableCell>
                      <TableCell>{formatNumber(e.count)}</TableCell>
                      <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                        {formatDateTime(e.date)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => removeExport(e.id)}
                          aria-label="Remove from history"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear export history?"
        description="This removes the history list only. Files you already downloaded are not affected."
        confirmLabel="Clear history"
        onConfirm={clearHistory}
      />
    </div>
  );
}
