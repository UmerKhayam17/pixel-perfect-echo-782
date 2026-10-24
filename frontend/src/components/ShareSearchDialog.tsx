import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { queryKeys, useUsers } from "@/hooks/queries";
import { api } from "@/lib/api";
import { formatNumber } from "@/utils/format";
import type { SearchRecord } from "@/types";

/** Admin: pick which staff members can see (and work) this search's leads. */
export function ShareSearchDialog({
  search,
  onClose,
}: {
  search: SearchRecord | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: users = [] } = useUsers(!!search);
  const members = users.filter((u) => u.role === "member" && u.active);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (search)
      setPicked(
        new Set(members.filter((u) => u.access?.searchIds.includes(search.id)).map((u) => u.id)),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, users.length]);

  async function save() {
    if (!search) return;
    setSaving(true);
    try {
      await api.setSearchAccess(search.id, [...picked]);
      toast.success(
        picked.size
          ? `Shared with ${picked.size} staff member${picked.size === 1 ? "" : "s"}.`
          : "No staff can see this search now.",
      );
      void qc.invalidateQueries({ queryKey: queryKeys.users });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!search} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Share with staff</DialogTitle>
          <DialogDescription>
            Ticked members will see and work the {formatNumber(search?.leadsFound ?? 0)} leads from
            “{search?.name}”. Admins always see everything.
          </DialogDescription>
        </DialogHeader>
        {members.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No active members yet — add them on the Team page.
          </p>
        ) : (
          <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {members.map((u) => (
              <li key={u.id}>
                <Label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 font-normal hover:bg-muted/50">
                  <Checkbox
                    checked={picked.has(u.id)}
                    onCheckedChange={(v) =>
                      setPicked((s) => {
                        const next = new Set(s);
                        if (v === true) next.add(u.id);
                        else next.delete(u.id);
                        return next;
                      })
                    }
                  />
                  <span>
                    <span className="block text-sm font-medium">{u.name}</span>
                    <span className="text-xs text-muted-foreground">{u.email}</span>
                  </span>
                </Label>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || members.length === 0}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
