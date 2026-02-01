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
  return (
    <DashboardClientShell>
      <DashboardShell shops={shops || []} initialUser={user}>
        {children}
      </DashboardShell>
    </DashboardClientShell>
  );
}
