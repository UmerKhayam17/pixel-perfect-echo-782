import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/hooks/queries";
import type { Permission } from "@/types";

const NAMES: Record<Permission, string> = {
  import: "Importing leads",
  export: "Exporting leads",
  campaigns: "Email campaigns",
};

/** Shows the page only if the user has the permission; the API enforces it as well. */
export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const { user, can } = useAuth();
  if (!user) return null;
  if (!can(permission)) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title={`${NAMES[permission]} is turned off for your account`}
        description="Ask a workspace admin to enable it on the Team page."
      />
    );
  }
  return <>{children}</>;
}
