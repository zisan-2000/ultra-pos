import { requireUser } from "@/lib/auth-session";
import UserManagementClient from "./UserManagementClient";

export default async function UserManagementPage() {
  const user = await requireUser();
  const canManageStaffPermissions =
    user.roles.includes("owner") || user.roles.includes("super_admin");
  return <UserManagementClient canManageStaffPermissions={canManageStaffPermissions} />;
}
