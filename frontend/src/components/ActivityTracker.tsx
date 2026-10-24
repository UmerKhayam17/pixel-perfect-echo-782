import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { api } from "@/lib/api";

type TrackedEvent = { kind: "page" | "click"; path: string; label: string; at: string };

const FLUSH_MS = 5000;
const CLICKABLE =
  'button, a, [role="button"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="switch"], [role="option"], [role="radio"], summary';

/** A short, human label for a clicked element — its accessible name, never form input values. */
function labelOf(el: Element): string {
  const aria = el.getAttribute("aria-label") || el.getAttribute("title");
  const text = aria || (el as HTMLElement).innerText || el.textContent || "";
  return text.replace(/\s+/g, " ").trim().slice(0, 100);
}

/**
 * Reports which pages a signed-in person opens and which buttons/links they press, in small
 * batches, for the admin's Staff Activity page. Text typed into fields is never recorded.
 */
export function ActivityTracker() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queue = useRef<TrackedEvent[]>([]);

  const flush = () => {
    if (!queue.current.length) return;
    const events = queue.current.splice(0, 60);
    void api.auditEvents(events).catch(() => {
      // Keep them for the next try if the API was briefly unreachable.
      queue.current.unshift(...events.slice(0, 60 - queue.current.length));
    });
  };

  // Page views (titles settle a moment after navigation).
  useEffect(() => {
    const t = window.setTimeout(() => {
      const title =
        document.title
          .replace(/\s*[—-]\s*LeadFinder Pro\s*$/, "")
          .replace(/^LeadFinder Pro\s*[—-]\s*/, "") || pathname;
      queue.current.push({
        kind: "page",
        path: pathname,
        label: title,
        at: new Date().toISOString(),
      });
    }, 400);
    return () => window.clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.(CLICKABLE);
      if (!el || el.closest("[data-no-track]")) return;
      const label = labelOf(el);
      if (!label) return;
      queue.current.push({
        kind: "click",
        path: window.location.pathname,
        label,
        at: new Date().toISOString(),
      });
    };
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("click", onClick, { capture: true });
    document.addEventListener("visibilitychange", onHide);
    const timer = window.setInterval(flush, FLUSH_MS);
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("visibilitychange", onHide);
      window.clearInterval(timer);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
