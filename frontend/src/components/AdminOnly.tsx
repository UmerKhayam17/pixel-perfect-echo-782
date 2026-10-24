import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/hooks/queries";

/** Renders children for admins; members see an explanation instead. The API enforces this too. */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin, user } = useAuth();
  if (!user) return null;
  if (!isAdmin) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Admins only"
        description="Ask a workspace admin if you need something changed here."
      />
    );
  }
  return <>{children}</>;
}
