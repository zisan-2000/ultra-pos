import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-session";
import { isSuperAdmin, hasPermission } from "@/lib/rbac";
import { getRbacUsersAndRoles, getRbacRolesAndPermissions } from "@/app/actions/rbac-admin";
import { RolesPermissionsPanel } from "./RolesPermissionsPanel";
import { UsersRolesPanel } from "./UsersRolesPanel";

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
    <main className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">RBAC Administration</h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage user roles and role permissions. Only users with RBAC admin access can use this page.
          </p>
        </div>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Users & Roles */}
        <UsersRolesPanel users={users as any} roles={roles as any} />

        {/* Roles & Permissions */}
        <RolesPermissionsPanel roles={roleList as any} permissions={permissions as any} />
      </section>
    </main>
  );
}
