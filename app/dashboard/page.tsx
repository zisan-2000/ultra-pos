// app/dashboard/page.tsx - role-based router

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-session";
import { isSuperAdmin, hasRole } from "@/lib/rbac";

export default async function DashboardRouter() {
  const user = await requireUser();

  // Fallback: if somehow roles array is empty, treat as owner
  const roles = user.roles ?? [];

  if (isSuperAdmin(user)) {
    redirect("/super-admin/dashboard");
  }

  if (hasRole(user, "admin")) {
    redirect("/admin/dashboard");
  }

  if (hasRole(user, "agent")) {
    redirect("/agent/dashboard");
  }

  if (hasRole(user, "owner")) {
    redirect("/owner/dashboard");
  }

  if (hasRole(user, "staff")) {
    redirect("/staff/dashboard");
  }

  // Default fallback: go to owner dashboard
  redirect("/owner/dashboard");
}
