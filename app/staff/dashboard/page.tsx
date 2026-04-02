import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-session";
import { hasRole, isSuperAdmin } from "@/lib/rbac";
import StaffDashboardPageContent from "./StaffDashboardPageContent";

type StaffDashboardPageProps = {
  searchParams?: Promise<{ shopId?: string } | undefined>;
};

export default async function StaffDashboardPage({
  searchParams,
}: StaffDashboardPageProps) {
  const user = await requireUser();

  if (!isSuperAdmin(user) && !hasRole(user, "staff")) {
    redirect("/dashboard");
  }

  return <StaffDashboardPageContent searchParams={searchParams} />;
}

