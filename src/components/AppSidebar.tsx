import { Link, useRouterState } from "@tanstack/react-router";
import { Download, History, LayoutDashboard, Radar, Search, Settings, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  { label: "Find Leads", to: "/find-leads", icon: Search },
  { label: "All Leads", to: "/leads", icon: Users },
  { label: "Search History", to: "/search-history", icon: History },
  { label: "Export Center", to: "/export-center", icon: Download },
  { label: "Settings", to: "/settings", icon: Settings },
];

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isActive = (to: string) =>
    to === "/" ? pathname === "/" : pathname.startsWith(to);

  return (
    <div className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/25">
          <Radar className="h-5 w-5" />
        </div>
        <div>
          <p className="font-display text-base font-bold leading-tight text-sidebar-accent-foreground">
            LeadFinder Pro
          </p>
          <p className="text-[11px] text-sidebar-muted">Lead intelligence suite</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
          Workspace
        </p>
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              }`}
            >
              <item.icon
                className={`h-[18px] w-[18px] ${active ? "text-sidebar-primary" : "text-sidebar-muted"}`}
              />
              {item.label}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary" />}
            </Link>
          );
        })}
      </nav>

      <div className="mx-3 mb-4 rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3">
        <p className="text-xs font-semibold text-sidebar-accent-foreground">Demo workspace</p>
        <p className="mt-1 text-[11px] leading-relaxed text-sidebar-muted">
          This prototype runs on simulated data. No live scraping is performed.
        </p>
      </div>
    </div>
  );
}
