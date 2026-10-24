import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  AtSign,
  Columns3,
  CopyX,
  FileUp,
  FileText,
  Megaphone,
  MessageCircle,
  Download,
  History,
  LayoutDashboard,
  ListTodo,
  Radar,
  Search,
  Settings,
  Users,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SourceBadge } from "@/components/SourceBadge";
import { useAuth, useSearches, useStats } from "@/hooks/queries";
import type { Permission } from "@/types";

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Hidden from members (the API rejects their changes anyway). */
  adminOnly?: boolean;
  /** Hidden from members without this permission. */
  permission?: Permission;
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Workspace",
    items: [
      { label: "Dashboard", to: "/", icon: LayoutDashboard },
      { label: "Reports", to: "/reports", icon: BarChart3 },
    ],
  },
  {
    title: "CRM",
    items: [
      { label: "All Leads", to: "/leads", icon: Users },
      { label: "Pipeline", to: "/pipeline", icon: Columns3 },
      { label: "Tasks", to: "/tasks", icon: ListTodo },
    ],
  },
  {
    title: "Outreach",
    items: [
      { label: "Email Campaigns", to: "/campaigns", icon: Megaphone, permission: "campaigns" },
      { label: "WhatsApp", to: "/whatsapp", icon: MessageCircle },
      { label: "Templates", to: "/templates", icon: FileText },
      { label: "Email Setup", to: "/email-setup", icon: AtSign, adminOnly: true },
    ],
  },
  {
    title: "Prospecting",
    items: [
      { label: "Find Leads", to: "/find-leads", icon: Search, adminOnly: true },
      { label: "Search History", to: "/search-history", icon: History },
    ],
  },
  {
    title: "Data",
    items: [
      { label: "Import Leads", to: "/import", icon: FileUp, permission: "import" },
      { label: "Duplicates", to: "/duplicates", icon: CopyX, adminOnly: true },
      { label: "Export Center", to: "/export-center", icon: Download, permission: "export" },
      { label: "Team", to: "/users", icon: UsersRound, adminOnly: true },
      { label: "Staff Activity", to: "/activity", icon: Activity, adminOnly: true },
      { label: "Settings", to: "/settings", icon: Settings, adminOnly: true },
    ],
  },
];

function WorkspaceStatus() {
  const { data: searches } = useSearches();
  const active = searches?.filter((s) => s.status === "running" || s.status === "paused") ?? [];

  return (
    <div className="mx-3 mb-4 space-y-2 rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3">
      <p className="text-xs font-semibold text-sidebar-accent-foreground">
        {active.length
          ? `${active.length} search${active.length > 1 ? "es" : ""} running`
          : "No searches running"}
      </p>
      {active.slice(0, 2).map((s) => (
        <Link
          key={s.id}
          to="/find-leads"
          search={{ searchId: s.id }}
          className="block truncate text-[11px] text-sidebar-muted hover:text-sidebar-accent-foreground"
        >
          {Math.floor(s.progress ?? 0)}% · {s.name}
        </Link>
      ))}
      <SourceBadge />
    </div>
  );
}

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: stats } = useStats();
  const due = (stats?.tasks.overdue ?? 0) + (stats?.tasks.dueToday ?? 0);
  const { isAdmin, can } = useAuth();
  const sections = NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => isAdmin || (!i.adminOnly && (!i.permission || can(i.permission)))),
  })).filter((s) => s.items.length);

  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

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

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
        {sections.map((section) => (
          <div key={section.title} className="space-y-1">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
              {section.title}
            </p>
            {section.items.map((item) => {
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
                  {item.to === "/tasks" && due > 0 ? (
                    <span
                      className="ml-auto rounded-full bg-sidebar-primary px-1.5 text-[11px] font-semibold text-sidebar-primary-foreground"
                      title="Tasks overdue or due today"
                    >
                      {due}
                    </span>
                  ) : (
                    active && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary" />
                    )
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <WorkspaceStatus />
    </div>
  );
}
