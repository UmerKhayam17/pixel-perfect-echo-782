import { useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Menu, FlaskConical } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AppSidebar } from "@/components/AppSidebar";
import { AppStateProvider, useAppState } from "@/hooks/useAppState";

const PAGE_TITLES: Array<{ match: (p: string) => boolean; title: string }> = [
  { match: (p) => p === "/", title: "Dashboard" },
  { match: (p) => p.startsWith("/find-leads"), title: "Find Leads" },
  { match: (p) => p.startsWith("/leads"), title: "All Leads" },
  { match: (p) => p.startsWith("/search-history"), title: "Search History" },
  { match: (p) => p.startsWith("/export-center"), title: "Export Center" },
  { match: (p) => p.startsWith("/settings"), title: "Settings" },
];

function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { settings } = useAppState();
  const title = PAGE_TITLES.find((t) => t.match(pathname))?.title ?? "LeadFinder Pro";
  const initials = settings.profileName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur lg:px-8">
      <button
        onClick={() => setMobileOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>
      <h1 className="font-display text-lg font-bold text-foreground">{title}</h1>
      <div className="ml-auto flex items-center gap-3">
        <span className="hidden items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-xs font-medium text-warning-foreground sm:inline-flex">
          <FlaskConical className="h-3.5 w-3.5" />
          Simulated data
        </span>
        <Avatar className="h-9 w-9 border border-border">
          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 border-sidebar-border bg-sidebar p-0 [&>button]:text-sidebar-foreground">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <AppSidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    </header>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppStateProvider>
      <div className="min-h-screen bg-background">
        <aside className="fixed inset-y-0 left-0 z-40 hidden lg:block">
          <AppSidebar />
        </aside>
        <div className="flex min-h-screen flex-col lg:pl-64">
          <Header />
          <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </AppStateProvider>
  );
}
