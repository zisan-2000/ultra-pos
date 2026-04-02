// app/dashboard/DashboardLayoutWrapper.tsx

import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getShopsByUser } from "@/app/actions/shops";
import { getCurrentUser } from "@/lib/auth-session";
import DashboardClientShell from "./DashboardClientShell";
import { DashboardShell } from "./DashboardShell";

export async function DashboardLayoutWrapper({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  const shops = await getShopsByUser();
  const isPureStaff =
    user.roles.includes("staff") &&
    !user.roles.includes("manager") &&
    !user.roles.includes("owner") &&
    !user.roles.includes("agent") &&
    !user.roles.includes("admin") &&
    !user.roles.includes("super_admin");
  const showCopilot = !isPureStaff;
  return (
    <DashboardClientShell showCopilot={showCopilot}>
      <DashboardShell shops={shops || []} initialUser={user}>
        {children}
      </DashboardShell>
    </DashboardClientShell>
  );
}
