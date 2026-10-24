import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Megaphone, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CampaignStatusBadge, createCampaignDraft } from "@/components/CampaignStatusBadge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { queryKeys, useCampaigns, useSenders } from "@/hooks/queries";
import { api } from "@/lib/api";
import { formatNumber, relativeTime } from "@/utils/format";
import type { Campaign } from "@/types";
import { RequirePermission } from "@/components/RequirePermission";

export const Route = createFileRoute("/campaigns")({
  head: () => ({
    meta: [
      { title: "Email campaigns — LeadFinder Pro" },
      { name: "description", content: "Send personalised outreach emails to your leads." },
    ],
  }),
  component: () => (
    <RequirePermission permission="campaigns">
      <CampaignsPage />
    </RequirePermission>
  ),
});

function CampaignsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: campaigns, isPending } = useCampaigns();
  const { data: senders } = useSenders();
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<Campaign | null>(null);

  async function create() {
    setCreating(true);
    try {
      const campaign = await createCampaignDraft({ query: {}, label: "All leads" }, "New campaign");
      void navigate({ to: "/campaigns/$id", params: { id: campaign.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the campaign.");
    } finally {
      setCreating(false);
    }
  }

  async function remove() {
    if (!toDelete) return;
    try {
      await api.deleteCampaign(toDelete.id);
      toast.success("Campaign deleted.");
      void qc.invalidateQueries({ queryKey: queryKeys.campaigns });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setToDelete(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold">Email campaigns</h2>
          <p className="text-sm text-muted-foreground">
            Send a personalised email to every business in a search, stage or tag.
          </p>
        </div>
        <Button onClick={create} disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{" "}
          New campaign
        </Button>
      </div>

      {senders && senders.length === 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-warning-foreground" />
          <span className="flex-1">Connect a mailbox before you can send.</span>
          <Button asChild size="sm" variant="outline">
            <Link to="/email-setup">Set up email</Link>
          </Button>
        </div>
      )}

      <Card className="card-shadow rounded-xl py-0">
        <CardContent className="p-0">
          {isPending ? (
            <div className="flex justify-center py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : !campaigns?.length ? (
            <EmptyState
              icon={Megaphone}
              title="No campaigns yet"
              description="Create one here, or select leads on the All Leads page and choose “Email”."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Campaign</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-56">Progress</TableHead>
                    <TableHead className="hidden md:table-cell">Replies</TableHead>
                    <TableHead className="hidden lg:table-cell">Failed</TableHead>
                    <TableHead className="hidden sm:table-cell">Created</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((c) => {
                    const done = c.sent + c.failed;
                    return (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer"
                        onClick={() =>
                          void navigate({ to: "/campaigns/$id", params: { id: c.id } })
                        }
                      >
                        <TableCell className="pl-4">
                          <p className="font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.audience.label}</p>
                        </TableCell>
                        <TableCell>
                          <CampaignStatusBadge status={c.status} />
                        </TableCell>
                        <TableCell>
                          {c.status === "draft" ? (
                            <span className="text-xs text-muted-foreground">Not sent yet</span>
                          ) : (
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">
                                  {formatNumber(c.sent)}
                                </span>{" "}
                                of {formatNumber(c.total)} sent
                              </p>
                              <Progress
                                value={c.total ? (done / c.total) * 100 : 0}
                                className="h-1.5"
                              />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {c.status === "draft" ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span>
                              <span className="font-medium">{formatNumber(c.replied ?? 0)}</span>
                              <span className="text-xs text-muted-foreground">
                                {" "}
                                ({c.sent ? Math.round(((c.replied ?? 0) / c.sent) * 100) : 0}%)
                              </span>
                            </span>
                          )}
                        </TableCell>
                        <TableCell
                          className={`hidden lg:table-cell ${c.failed ? "text-destructive" : "text-muted-foreground"}`}
                        >
                          {formatNumber(c.failed)}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                          {relativeTime(c.createdAt)}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label="Campaign actions"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                disabled={c.status === "sending"}
                                onClick={() => setToDelete(c)}
                              >
                                <Trash2 className="h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Delete this campaign?"
        description="Its send log is removed, so later campaigns may email the same addresses again. Emails already sent stay on each lead's timeline."
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </div>
  );
}
