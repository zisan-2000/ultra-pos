import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import UserManagementClient from "./UserManagementClient";

export default async function UserManagementPage() {
  const user = await requireUser();
  const canEditUsersUnderMe = hasPermission(user, "edit_users_under_me");
  const canManageStaffPermissions =
    canEditUsersUnderMe &&
    (user.roles.includes("owner") ||
      user.roles.includes("super_admin") ||
      user.roles.includes("manager"));
  const canImpersonate =
    user.roles.includes("super_admin") && !(user.isImpersonating ?? false);
  return (
    <UserManagementClient
      canManageStaffPermissions={canManageStaffPermissions}
      canImpersonate={canImpersonate}
      currentUserId={user.id}
    />
  );
}
