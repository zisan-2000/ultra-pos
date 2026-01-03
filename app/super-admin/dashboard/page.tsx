import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-session";
import { isSuperAdmin } from "@/lib/rbac";

export default async function SuperAdminDashboardPage() {
  const user = await requireUser();

  if (!isSuperAdmin(user)) {
    redirect("/dashboard");
  }

  return (
    <div className="py-8">
      <h1 className="text-2xl font-bold mb-2">Welcome to the Super Admin Dashboard</h1>
      <p className="text-sm text-muted-foreground">Use the RBAC menu to manage roles and permissions.</p>
    </div>
  );
}

