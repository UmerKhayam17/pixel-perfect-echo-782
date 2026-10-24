import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  Undo2,
  Upload,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CountryCombobox } from "@/components/CountryCombobox";
import { STAGES } from "@/components/CrmBadges";
import { TagInput } from "@/components/TagInput";
import { queryKeys, useAuth, useImports, useInvalidateData } from "@/hooks/queries";
import { api } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/utils/format";
import {
  IMPORT_FIELDS,
  SAMPLE_CSV,
  applyMapping,
  autoMap,
  parseSpreadsheet,
  type ColumnMapping,
  type ParsedFile,
} from "@/utils/importMapping";
import type {
  ImportAnalysis,
  ImportOptions,
  ImportRecord,
  ImportRow,
  ImportRowResult,
  LeadStage,
  MatchKey,
} from "@/types";
import { RequirePermission } from "@/components/RequirePermission";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [
      { title: "Import leads — LeadFinder Pro" },
      {
        name: "description",
        content: "Import leads from CSV or Excel without creating duplicates.",
      },
    ],
  }),
  component: () => (
    <RequirePermission permission="import">
      <ImportPage />
    </RequirePermission>
  ),
});

const NONE = "__none__";
const MATCH_OPTIONS: { key: MatchKey; label: string; hint: string }[] = [
  { key: "placeId", label: "Google profile", hint: "Same Google Maps listing" },
  { key: "emailKey", label: "Email", hint: "Same address, any capitalisation" },
  { key: "phoneKey", label: "Phone", hint: "Same number, any format (0300… = +92 300…)" },
  { key: "domainKey", label: "Website", hint: "Same domain (www, https and pages ignored)" },
  { key: "nameKey", label: "Name + city", hint: "Ignores case, punctuation, “Pvt Ltd”…" },
];

const STATUS: Record<ImportRowResult["status"], { label: string; className: string }> = {
  new: { label: "New", className: "border-success/30 bg-success/10 text-success" },
  existing: {
    label: "Already exists",
    className: "border-warning/40 bg-warning/10 text-warning-foreground",
  },
  in_file: { label: "Repeated in file", className: "border-primary/30 bg-primary/10 text-primary" },
  invalid: {
    label: "Invalid",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
};

type Step = "upload" | "map" | "review" | "done";

function ImportPage() {
  const qc = useQueryClient();
  const invalidateData = useInvalidateData();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [sheet, setSheet] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [options, setOptions] = useState<ImportOptions>({
    matchOn: MATCH_OPTIONS.map((m) => m.key),
    duplicateMode: "skip",
    defaults: { country: "", category: "", stage: "new", tags: [] },
  });
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [mappedRows, setMappedRows] = useState<ImportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportRecord | null>(null);

  function loadSheet(p: ParsedFile, name: string) {
    const { headers: h, rows } = p.read(name);
    setSheet(name);
    setHeaders(h);
    setRawRows(rows);
    setMapping(autoMap(h));
  }

  async function onFile(f: File) {
    if (!/\.(csv|xlsx|xls|tsv|txt)$/i.test(f.name)) {
      toast.error("Choose a .csv, .xlsx or .xls file.");
      return;
    }
    setBusy(true);
    try {
      const p = await parseSpreadsheet(f);
      if (!p.sheets.length) throw new Error("The file has no sheets.");
      setFile(f);
      setParsed(p);
      loadSheet(p, p.sheets[0]!);
      setStep("map");
    } catch (err) {
      toast.error(
        err instanceof Error ? `Couldn't read the file: ${err.message}` : "Couldn't read the file.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    setBusy(true);
    try {
      const rows = applyMapping(rawRows, mapping);
      setMappedRows(rows);
      setAnalysis(await api.analyzeImport(rows, options));
      setStep("review");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not check the file.");
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    setBusy(true);
    try {
      const record = await api.runImport(mappedRows, options, file?.name ?? "import");
      setResult(record);
      setStep("done");
      void invalidateData();
      void qc.invalidateQueries({ queryKey: queryKeys.imports });
      toast.success(`${formatNumber(record.created)} new leads imported.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep("upload");
    setFile(null);
    setParsed(null);
    setAnalysis(null);
    setResult(null);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold">Import leads</h2>
          <p className="text-sm text-muted-foreground">
            Bring in leads from a CSV or Excel file. Every row is checked against your database
            first — duplicates are never created.
          </p>
        </div>
        <Stepper step={step} />
      </div>

      {step === "upload" && <UploadStep busy={busy} onFile={onFile} />}

      {step === "map" && parsed && (
        <MapStep
          filename={file?.name ?? ""}
          parsed={parsed}
          sheet={sheet}
          onSheet={(s) => loadSheet(parsed, s)}
          headers={headers}
          rows={rawRows}
          mapping={mapping}
          setMapping={setMapping}
          options={options}
          setOptions={setOptions}
          busy={busy}
          onBack={reset}
          onNext={check}
        />
      )}

      {step === "review" && analysis && (
        <ReviewStep
          analysis={analysis}
          rows={mappedRows}
          options={options}
          setOptions={setOptions}
          busy={busy}
          onBack={() => setStep("map")}
          onImport={runImport}
        />
      )}

      {step === "done" && result && <DoneStep result={result} onAgain={reset} />}

      {step === "upload" && <ImportHistory />}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "map", label: "Match columns" },
    { key: "review", label: "Check duplicates" },
    { key: "done", label: "Done" },
  ];
  const index = steps.findIndex((s) => s.key === step);
  return (
    <ol className="flex items-center gap-1 text-xs">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full font-semibold ${
              i < index
                ? "bg-success text-success-foreground"
                : i === index
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {i < index ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
          </span>
          <span
            className={`hidden md:inline ${i === index ? "font-medium" : "text-muted-foreground"}`}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="mx-1 h-px w-4 bg-border" />}
        </li>
      ))}
    </ol>
  );
}

function UploadStep({ busy, onFile }: { busy: boolean; onFile: (f: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function downloadSample() {
    const url = URL.createObjectURL(
      new Blob(["﻿" + SAMPLE_CSV], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "leadfinder-import-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="card-shadow rounded-xl">
      <CardContent className="p-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) onFile(f);
          }}
          onClick={() => input.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
            dragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/40"
          }`}
        >
          {busy ? (
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          ) : (
            <Upload className="h-10 w-10 text-muted-foreground" />
          )}
          <p className="mt-4 font-display text-base font-semibold">
            Drop a CSV or Excel file here, or click to choose
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            .csv, .xlsx or .xls · up to 20,000 rows · the first row must be column headings
          </p>
          <input
            ref={input}
            type="file"
            accept=".csv,.xlsx,.xls,.tsv,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <p>
            Files exported from LeadFinder, Google Sheets, Excel or other lead tools all work —
            you'll match the columns next.
          </p>
          <Button variant="outline" size="sm" onClick={downloadSample}>
            <Download className="h-4 w-4" /> Sample CSV
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MapStep({
  filename,
  parsed,
  sheet,
  onSheet,
  headers,
  rows,
  mapping,
  setMapping,
  options,
  setOptions,
  busy,
  onBack,
  onNext,
}: {
  filename: string;
  parsed: ParsedFile;
  sheet: string;
  onSheet: (s: string) => void;
  headers: string[];
  rows: Record<string, string>[];
  mapping: ColumnMapping;
  setMapping: (m: ColumnMapping) => void;
  options: ImportOptions;
  setOptions: (o: ImportOptions) => void;
  busy: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const sample = (col: string | undefined) =>
    col
      ? rows
          .slice(0, 3)
          .map((r) => r[col])
          .filter(Boolean)
          .join(" · ") || "(empty in first rows)"
      : "";
  const setDefault = <K extends keyof ImportOptions["defaults"]>(
    k: K,
    v: ImportOptions["defaults"][K],
  ) => setOptions({ ...options, defaults: { ...options.defaults, [k]: v } });
  const mappedCount = Object.values(mapping).filter(Boolean).length;
  const ready = !!mapping.businessName && options.matchOn.length > 0 && rows.length > 0;

  return (
    <div className="space-y-5">
      <Card className="card-shadow rounded-xl">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 font-display text-base font-semibold">
              <FileSpreadsheet className="h-4 w-4 text-success" /> {filename}
            </CardTitle>
            <CardDescription>
              {formatNumber(rows.length)} rows · {headers.length} columns · {mappedCount} matched
              automatically. Check each field below.
            </CardDescription>
          </div>
          {parsed.sheets.length > 1 && (
            <Select value={sheet} onValueChange={onSheet}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {parsed.sheets.map((s) => (
                  <SelectItem key={s} value={s}>
                    Sheet: {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">LeadFinder field</TableHead>
                  <TableHead>Column in your file</TableHead>
                  <TableHead className="hidden md:table-cell">Sample values</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {IMPORT_FIELDS.map((f) => (
                  <TableRow key={f.key}>
                    <TableCell className="pl-6 font-medium">
                      {f.label} {f.required && <span className="text-destructive">*</span>}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={mapping[f.key] ?? NONE}
                        onValueChange={(v) =>
                          setMapping({ ...mapping, [f.key]: v === NONE ? undefined : v })
                        }
                      >
                        <SelectTrigger
                          className={`w-60 ${f.required && !mapping[f.key] ? "border-destructive" : ""}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>— Don't import —</SelectItem>
                          {headers.map((h) => (
                            <SelectItem key={h} value={h}>
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="hidden max-w-xs truncate text-xs text-muted-foreground md:table-cell">
                      {sample(mapping[f.key])}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="card-shadow rounded-xl">
          <CardHeader>
            <CardTitle className="font-display text-base font-semibold">
              Apply to every imported lead
            </CardTitle>
            <CardDescription>
              Used when a row leaves the field empty. Tags are added to all rows.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Country</Label>
                <CountryCombobox
                  value={options.defaults.country}
                  onChange={(v) => setDefault("country", v)}
                  placeholder="Leave as in file"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="def-category">Category</Label>
                <Input
                  id="def-category"
                  value={options.defaults.category}
                  onChange={(e) => setDefault("category", e.target.value)}
                  placeholder="e.g. Dentist"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Stage</Label>
                <Select
                  value={options.defaults.stage}
                  onValueChange={(v) => setDefault("stage", v as LeadStage)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tags</Label>
                <TagInput
                  value={options.defaults.tags}
                  onChange={(t) => setDefault("tags", t)}
                  placeholder="e.g. expo-2026"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="card-shadow rounded-xl">
          <CardHeader>
            <CardTitle className="font-display text-base font-semibold">
              How to spot duplicates
            </CardTitle>
            <CardDescription>
              A row is a duplicate if any checked detail matches an existing lead or an earlier row.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {MATCH_OPTIONS.map((m) => (
              <Label key={m.key} className="flex items-start gap-2.5 font-normal">
                <Checkbox
                  className="mt-0.5"
                  checked={options.matchOn.includes(m.key)}
                  onCheckedChange={(v) =>
                    setOptions({
                      ...options,
                      matchOn:
                        v === true
                          ? [...options.matchOn, m.key]
                          : options.matchOn.filter((k) => k !== m.key),
                    })
                  }
                />
                <span>
                  <span className="block text-sm font-medium">{m.label}</span>
                  <span className="block text-xs text-muted-foreground">{m.hint}</span>
                </span>
              </Label>
            ))}
            <p className="pt-1 text-[11px] text-muted-foreground">
              Tip: untick Website for chains whose branches share one site. Exact name + city is
              always checked.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Choose another file
        </Button>
        <Button onClick={onNext} disabled={!ready || busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}{" "}
          Check {formatNumber(rows.length)} rows for duplicates
        </Button>
      </div>
    </div>
  );
}

function ReviewStep({
  analysis,
  rows,
  options,
  setOptions,
  busy,
  onBack,
  onImport,
}: {
  analysis: ImportAnalysis;
  rows: ImportRow[];
  options: ImportOptions;
  setOptions: (o: ImportOptions) => void;
  busy: boolean;
  onBack: () => void;
  onImport: () => void;
}) {
  const [tab, setTab] = useState<"all" | ImportRowResult["status"]>("all");
  const [confirm, setConfirm] = useState(false);
  const { counts } = analysis;
  const visible = useMemo(
    () => (tab === "all" ? analysis.rows : analysis.rows.filter((r) => r.status === tab)),
    [analysis, tab],
  );
  const willUpdate = options.duplicateMode === "fill" ? counts.fillable : 0;
  const nothing = counts.new === 0 && willUpdate === 0;

  const cards: { label: string; value: number; tone: string; icon: typeof Users; note: string }[] =
    [
      {
        label: "New leads",
        value: counts.new,
        tone: "text-success",
        icon: CheckCircle2,
        note: "will be added",
      },
      {
        label: "Already in your database",
        value: counts.existing,
        tone: "text-warning-foreground",
        icon: Copy,
        note:
          options.duplicateMode === "fill"
            ? `${counts.fillable} can get missing details`
            : "will be skipped",
      },
      {
        label: "Repeated in this file",
        value: counts.inFile,
        tone: "text-primary",
        icon: Copy,
        note: "merged into the first copy",
      },
      {
        label: "Invalid rows",
        value: counts.invalid,
        tone: "text-destructive",
        icon: AlertCircle,
        note: "no business name",
      },
    ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="card-shadow gap-0 rounded-xl py-0">
            <CardContent className="p-4">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <c.icon className={`h-3.5 w-3.5 ${c.tone}`} /> {c.label}
              </p>
              <p className="font-display text-2xl font-bold">{formatNumber(c.value)}</p>
              <p className="text-[11px] text-muted-foreground">{c.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {counts.existing > 0 && (
        <Card className="card-shadow rounded-xl">
          <CardHeader>
            <CardTitle className="font-display text-base font-semibold">
              {formatNumber(counts.existing)} businesses are already in your database
            </CardTitle>
            <CardDescription>
              No duplicate leads are created either way. Choose what happens to the existing ones:
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={options.duplicateMode}
              onValueChange={(v) =>
                setOptions({ ...options, duplicateMode: v as ImportOptions["duplicateMode"] })
              }
              className="gap-3 sm:grid-cols-2"
            >
              {[
                {
                  value: "skip",
                  label: "Leave them untouched",
                  hint: "Skip these rows completely.",
                },
                {
                  value: "fill",
                  label: "Add missing details only",
                  hint: `Fill empty fields (e.g. a missing email) and add tags on ${formatNumber(counts.fillable)} leads. Nothing is overwritten.`,
                },
              ].map((o) => (
                <Label
                  key={o.value}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                >
                  <RadioGroupItem value={o.value} className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">{o.label}</span>
                    <span className="block text-xs text-muted-foreground">{o.hint}</span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>
      )}

      <Card className="card-shadow rounded-xl py-0">
        <div className="border-b border-border px-4 py-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="flex-wrap">
              <TabsTrigger value="all">All ({formatNumber(analysis.totalRows)})</TabsTrigger>
              <TabsTrigger value="new">New ({formatNumber(counts.new)})</TabsTrigger>
              <TabsTrigger value="existing">
                Already exist ({formatNumber(counts.existing)})
              </TabsTrigger>
              <TabsTrigger value="in_file">Repeated ({formatNumber(counts.inFile)})</TabsTrigger>
              <TabsTrigger value="invalid">Invalid ({formatNumber(counts.invalid)})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <CardContent className="p-0">
          <div className="max-h-[32rem] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14 pl-4">Row</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead className="hidden md:table-cell">Phone / email</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Why</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.slice(0, 500).map((r) => {
                  const row = rows[r.index] ?? {};
                  return (
                    <TableRow key={r.index}>
                      <TableCell className="pl-4 text-xs text-muted-foreground">
                        {r.index + 2}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">
                          {row.businessName || <em className="text-muted-foreground">no name</em>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[row.city, row.country].filter(Boolean).join(", ")}
                        </p>
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                        {[row.phone, row.email].filter(Boolean).join(" · ") || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS[r.status].className}>
                          {STATUS[r.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.status === "existing" && r.existing && (
                          <>
                            Same {r.by?.toLowerCase()} as{" "}
                            <Link
                              to="/leads/$id"
                              params={{ id: r.existing.id }}
                              className="font-medium text-foreground hover:text-primary"
                              target="_blank"
                            >
                              {r.existing.businessName}
                            </Link>
                            {options.duplicateMode === "fill" && r.fills.length > 0 && (
                              <span className="block text-success">
                                Will add:{" "}
                                {r.fills
                                  .map((f) => IMPORT_FIELDS.find((x) => x.key === f)?.label ?? f)
                                  .join(", ")}
                              </span>
                            )}
                          </>
                        )}
                        {r.status === "in_file" &&
                          `Same ${r.by?.toLowerCase()} as row ${(r.ofRow ?? 0) + 2}`}
                        {r.status === "invalid" && r.reason}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {visible.length > 500 && (
              <p className="py-3 text-center text-xs text-muted-foreground">
                Showing the first 500 of {formatNumber(visible.length)} rows.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-between gap-3">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back to columns
        </Button>
        <Button size="lg" onClick={() => setConfirm(true)} disabled={busy || nothing}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {nothing
            ? "Nothing new to import"
            : `Import ${formatNumber(counts.new)} new lead${counts.new === 1 ? "" : "s"}${willUpdate ? ` & update ${formatNumber(willUpdate)}` : ""}`}
        </Button>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        destructive={false}
        title="Import now?"
        description={`${formatNumber(counts.new)} new leads will be added${willUpdate ? ` and ${formatNumber(willUpdate)} existing leads will get missing details` : ""}. ${formatNumber(counts.existing + counts.inFile + counts.invalid)} rows will be skipped. You can undo the new leads later from the import history.`}
        confirmLabel="Import"
        onConfirm={() => {
          setConfirm(false);
          onImport();
        }}
      />
    </div>
  );
}

function DoneStep({ result, onAgain }: { result: ImportRecord; onAgain: () => void }) {
  return (
    <Card className="card-shadow rounded-xl">
      <CardContent className="flex flex-col items-center px-6 py-12 text-center">
        <CheckCircle2 className="h-12 w-12 text-success" />
        <p className="mt-4 font-display text-lg font-bold">Import complete</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {formatNumber(result.created)} new leads added
          {result.updated > 0 && `, ${formatNumber(result.updated)} existing leads updated`}.
          Skipped {formatNumber(result.skippedExisting)} already in your database,{" "}
          {formatNumber(result.duplicatesInFile)} repeated rows and {formatNumber(result.invalid)}{" "}
          invalid rows.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {result.created > 0 && (
            <Button asChild>
              <Link to="/leads" search={{ importId: result.id }}>
                <Users className="h-4 w-4" /> View imported leads
              </Link>
            </Button>
          )}
          <Button variant="outline" onClick={onAgain}>
            <RotateCcw className="h-4 w-4" /> Import another file
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ImportHistory() {
  const qc = useQueryClient();
  const invalidateData = useInvalidateData();
  const { isAdmin } = useAuth();
  const { data: imports = [] } = useImports();
  const [toUndo, setToUndo] = useState<ImportRecord | null>(null);

  async function undo() {
    if (!toUndo) return;
    try {
      const { deleted, kept } = await api.undoImport(toUndo.id);
      toast.success(
        `${formatNumber(deleted)} imported leads removed${kept ? `; ${formatNumber(kept)} kept because someone already worked on them` : ""}.`,
      );
      void invalidateData();
      void qc.invalidateQueries({ queryKey: queryKeys.imports });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Undo failed.");
    } finally {
      setToUndo(null);
    }
  }

  if (!imports.length) return null;
  return (
    <Card className="card-shadow rounded-xl py-0">
      <CardHeader className="py-4">
        <CardTitle className="font-display text-base font-semibold">Import history</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">File</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="hidden sm:table-cell">Updated</TableHead>
                <TableHead className="hidden md:table-cell">Skipped</TableHead>
                <TableHead className="hidden lg:table-cell">By</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {imports.map((i) => (
                <TableRow key={i.id} className={i.undoneAt ? "opacity-60" : undefined}>
                  <TableCell className="pl-4">
                    <p className="font-medium">{i.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(i.createdAt)} · {formatNumber(i.totalRows)} rows
                      {i.undoneAt && " · undone"}
                    </p>
                  </TableCell>
                  <TableCell>
                    {i.created > 0 && !i.undoneAt ? (
                      <Link
                        to="/leads"
                        search={{ importId: i.id }}
                        className="font-medium hover:text-primary"
                      >
                        {formatNumber(i.created)}
                      </Link>
                    ) : (
                      formatNumber(i.created)
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{formatNumber(i.updated)}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {formatNumber(i.skippedExisting + i.duplicatesInFile + i.invalid)}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {i.by}
                  </TableCell>
                  <TableCell>
                    {/* Undo deletes leads, so it is admin-only. */}
                    {!i.undoneAt && i.created > 0 && isAdmin && (
                      <Button variant="ghost" size="sm" onClick={() => setToUndo(i)}>
                        <Undo2 className="h-4 w-4" /> Undo
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <ConfirmDialog
        open={!!toUndo}
        onOpenChange={(open) => !open && setToUndo(null)}
        title={`Undo “${toUndo?.filename}”?`}
        description="Leads this import added are deleted, unless someone has already moved them past “New”. Details it filled in on existing leads stay."
        confirmLabel="Undo import"
        onConfirm={undo}
      />
    </Card>
  );
}
