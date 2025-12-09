import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-session";
import { hasRole, isSuperAdmin } from "@/lib/rbac";

export default async function AdminDashboardPage() {
  const user = await requireUser();

  if (!isSuperAdmin(user) && !hasRole(user, "admin")) {
    redirect("/dashboard");
  }

  return (
    <div className="py-8">
      <h1 className="text-2xl font-bold mb-2">Welcome to the Admin Dashboard</h1>
      <p className="text-sm text-gray-600">Here you can oversee shop performance and manage operations.</p>
    </div>
  );
}

