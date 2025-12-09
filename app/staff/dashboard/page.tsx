import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-session";
import { hasRole, isSuperAdmin } from "@/lib/rbac";

export default async function StaffDashboardPage() {
  const user = await requireUser();

  if (!isSuperAdmin(user) && !hasRole(user, "staff")) {
    redirect("/dashboard");
  }

  return (
    <div className="py-8">
      <h1 className="text-2xl font-bold mb-2">Welcome to the Staff Dashboard</h1>
      <p className="text-sm text-gray-600">You can access your daily tasks and view key info here.</p>
    </div>
  );
}

