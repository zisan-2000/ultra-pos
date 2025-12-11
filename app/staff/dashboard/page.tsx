import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-session";
import { hasRole, isSuperAdmin } from "@/lib/rbac";
import OwnerDashboardPage from "@/app/owner/dashboard/page";

export default async function StaffDashboardPage() {
  const user = await requireUser();

  if (!isSuperAdmin(user) && !hasRole(user, "staff")) {
    redirect("/dashboard");
  }

  return <OwnerDashboardPage />;
}

