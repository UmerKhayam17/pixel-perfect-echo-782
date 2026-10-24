import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { queryKeys, useImports, useSearches } from "@/hooks/queries";
import { api } from "@/lib/api";
import { formatDate, formatNumber } from "@/utils/format";
import type { Permission, User } from "@/types";

export const PERMISSION_INFO: { key: Permission; label: string; hint: string; default: boolean }[] =
  [
    {
      key: "import",
      label: "Import leads",
      hint: "Imported leads are assigned to them.",
      default: true,
    },
    {
      key: "campaigns",
      label: "Send email campaigns",
      hint: "Only to the leads they can see.",
      default: true,
    },
    {
      key: "export",
      label: "Export leads (CSV / Excel)",
      hint: "Off by default so lead data stays in the system.",
      default: false,
    },
  ];

/** Admin: which searches/imports a member can see, and what they may do. */
export function StaffAccessDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: searches = [] } = useSearches();
  const { data: imports = [] } = useImports();
  const [searchIds, setSearchIds] = useState<Set<string>>(new Set());
  const [importIds, setImportIds] = useState<Set<string>>(new Set());
  const [permissions, setPermissions] = useState<Record<Permission, boolean>>(
    {} as Record<Permission, boolean>,
  );
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setSearchIds(new Set(user.access?.searchIds ?? []));
    setImportIds(new Set(user.access?.importIds ?? []));
    setPermissions(
      Object.fromEntries(
        PERMISSION_INFO.map((p) => [p.key, user.permissions?.[p.key] ?? p.default]),
      ) as Record<Permission, boolean>,
    );
    setFilter("");
  }, [user]);

  const visibleSearches = useMemo(
    () =>
      searches.filter(
        (s) => s.leadsFound > 0 && s.name.toLowerCase().includes(filter.toLowerCase()),
      ),
    [searches, filter],
  );
  const usableImports = imports.filter((i) => !i.undoneAt && i.created > 0);

  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  };

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      await api.updateUser(user.id, {
        access: { searchIds: [...searchIds], importIds: [...importIds] },
        permissions,
      });
      toast.success(`${user.name}'s access updated.`);
      void qc.invalidateQueries({ queryKey: queryKeys.users });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  const selectedLeads = searches
    .filter((s) => searchIds.has(s.id))
    .reduce((n, s) => n + s.leadsFound, 0);

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Access for {user?.name}</DialogTitle>
          <DialogDescription>
            Members only see leads from the searches and imports ticked here, plus leads you assign
            to them and leads they add themselves. Currently:{" "}
            {formatNumber(user?.visibleLeads ?? 0)} leads.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="searches">
          <TabsList>
            <TabsTrigger value="searches">Searches ({searchIds.size})</TabsTrigger>
            <TabsTrigger value="imports">Imports ({importIds.size})</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
          </TabsList>

          <TabsContent value="searches" className="space-y-3 pt-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter searches"
                  className="h-8 pl-8"
                />
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSearchIds(new Set(visibleSearches.map((s) => s.id)))}
              >
                Select all
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSearchIds(new Set())}>
                Clear
              </Button>
            </div>
            {visibleSearches.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No searches with leads yet.
              </p>
            ) : (
              <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {visibleSearches.map((s) => (
                  <li key={s.id}>
                    <Label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 font-normal hover:bg-muted/50">
                      <Checkbox
                        checked={searchIds.has(s.id)}
                        onCheckedChange={(v) => setSearchIds(toggle(searchIds, s.id, v === true))}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{s.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatNumber(s.leadsFound)} leads · {formatDate(s.date)}
                        </span>
                      </span>
                    </Label>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              About {formatNumber(selectedLeads)} leads from the ticked searches.
            </p>
          </TabsContent>

          <TabsContent value="imports" className="space-y-3 pt-3">
            {usableImports.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No imports yet.</p>
            ) : (
              <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {usableImports.map((i) => (
                  <li key={i.id}>
                    <Label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 font-normal hover:bg-muted/50">
                      <Checkbox
                        checked={importIds.has(i.id)}
                        onCheckedChange={(v) => setImportIds(toggle(importIds, i.id, v === true))}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{i.filename}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatNumber(i.created)} leads · {formatDate(i.createdAt)}
                          {i.by && ` · by ${i.by}`}
                        </span>
                      </span>
                    </Label>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="permissions" className="space-y-2 pt-3">
            {PERMISSION_INFO.map((p) => (
              <div
                key={p.key}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium">{p.label}</p>
                  <p className="text-xs text-muted-foreground">{p.hint}</p>
                </div>
                <Switch
                  checked={!!permissions[p.key]}
                  onCheckedChange={(v) => setPermissions((s) => ({ ...s, [p.key]: v }))}
                />
              </div>
            ))}
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
