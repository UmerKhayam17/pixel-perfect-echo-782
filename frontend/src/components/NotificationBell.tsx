import { useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BellRing,
  CalendarClock,
  CheckCheck,
  Mail,
  Megaphone,
  Search,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { queryKeys, useNotifications } from "@/hooks/queries";
import { api } from "@/lib/api";
import { relativeTime } from "@/utils/format";
import type { AppNotification } from "@/types";

const ICONS: Record<string, LucideIcon> = {
  leads_assigned: Users,
  campaign_shared: Megaphone,
  task_assigned: CalendarClock,
  task_due: CalendarClock,
  email_reply: Mail,
  search_done: Search,
};

const canNotify = () => typeof window !== "undefined" && "Notification" in window;

/** Header bell: unread count, the latest notifications, and optional desktop pop-ups. */
export function NotificationBell() {
  const qc = useQueryClient();
  const router = useRouter();
  const { data } = useNotifications();
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported",
  );
  const seen = useRef<Set<string> | null>(null);
  const unread = data?.unread ?? 0;

  useEffect(() => {
    if (canNotify()) setPermission(Notification.permission);
  }, []);

  // Pop up a desktop notification for anything new since the page loaded.
  useEffect(() => {
    if (!data) return;
    if (seen.current === null) {
      seen.current = new Set(data.items.map((n) => n.id));
      return;
    }
    const fresh = data.items.filter((n) => !n.read && !seen.current!.has(n.id));
    fresh.forEach((n) => seen.current!.add(n.id));
    if (canNotify() && Notification.permission === "granted") {
      for (const n of fresh.slice(0, 3)) {
        const popup = new Notification(n.title, { body: n.body, tag: n.id });
        popup.onclick = () => {
          window.focus();
          void openNotification(n);
        };
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.notifications });

  async function openNotification(n: AppNotification) {
    setOpen(false);
    if (!n.read) {
      await api.readNotification(n.id).catch(() => undefined);
      void refresh();
    }
    // Links can carry a query string (e.g. /leads?assignedTo=me), so go through history.
    if (n.link) router.history.push(n.link);
  }

  async function enableDesktop() {
    if (!canNotify()) return;
    setPermission(await Notification.requestPermission());
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        >
          {unread ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <p className="font-display text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={async () => {
                await api.readAllNotifications();
                void refresh();
              }}
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </Button>
          )}
        </div>
        <ul className="max-h-[26rem] overflow-y-auto">
          {!data?.items.length ? (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">
              You're all caught up.
            </li>
          ) : (
            data.items.map((n) => {
              const Icon = ICONS[n.type] ?? Bell;
              return (
                <li key={n.id}>
                  <button
                    onClick={() => void openNotification(n)}
                    className={`flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-muted/60 ${n.read ? "" : "bg-primary/5"}`}
                  >
                    <span
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${n.read ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm ${n.read ? "" : "font-semibold"}`}>
                        {n.title}
                      </span>
                      {n.body && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {n.body}
                        </span>
                      )}
                      <span className="block text-[11px] text-muted-foreground">
                        {relativeTime(n.createdAt)}
                      </span>
                    </span>
                    {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  </button>
                </li>
              );
            })
          )}
        </ul>
        {permission === "default" && (
          <div className="border-t border-border px-4 py-2.5">
            <Button variant="outline" size="sm" className="w-full" onClick={enableDesktop}>
              <BellRing className="h-4 w-4" /> Also show desktop alerts
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
