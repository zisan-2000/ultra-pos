import { requireUser } from "@/lib/auth-session";
import { hasRole, isSuperAdmin } from "@/lib/rbac";
import AdminDashboardPage from "../admin/dashboard/page";
import AgentDashboardPage from "../agent/dashboard/page";
import OwnerDashboardPage from "../owner/dashboard/page";
import SuperAdminDashboardPage from "../super-admin/dashboard/page";

type DashboardPageProps = {
  searchParams?: Promise<{ shopId?: string } | undefined>;
};

export default async function DashboardPage(props: DashboardPageProps) {
  const user = await requireUser();

  if (isSuperAdmin(user)) {
    return <SuperAdminDashboardPage />;
  }

  if (hasRole(user, "admin")) {
    return <AdminDashboardPage />;
  }

  if (hasRole(user, "agent")) {
    return <AgentDashboardPage />;
  }

  return <OwnerDashboardPage {...props} />;
}
