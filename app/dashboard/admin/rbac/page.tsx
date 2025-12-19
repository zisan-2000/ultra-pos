import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-session";
import { isSuperAdmin, hasPermission } from "@/lib/rbac";
import { getRbacUsersAndRoles, getRbacRolesAndPermissions } from "@/app/actions/rbac-admin";
import RbacAdminClient from "./RbacAdminClient";

export default async function RbacAdminPage() {
  const user = await requireUser();
  const canAccess = isSuperAdmin(user) || hasPermission(user, "access_rbac_admin");
  if (!canAccess) {
    redirect("/dashboard");
  }

  const [{ users, roles }, { roles: roleList, permissions }] = await Promise.all([
    getRbacUsersAndRoles(),
    getRbacRolesAndPermissions(),
  ]);

  return (
    <RbacAdminClient
      users={users as any}
      roleOptions={roles as any}
      roles={roleList as any}
      permissions={permissions as any}
    />
  );
}
