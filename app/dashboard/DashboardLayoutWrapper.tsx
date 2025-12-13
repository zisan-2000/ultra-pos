import type { ReactNode } from "react";
import { getShopsByUser } from "@/app/actions/shops";
import { getCurrentUser } from "@/lib/auth-session";
import { DashboardShell } from "./DashboardShell";

export async function DashboardLayoutWrapper({
  children,
}: {
  children: ReactNode;
}) {
  const shops = await getShopsByUser();
  const user = await getCurrentUser();
  return (
    <DashboardShell shops={shops || []} initialUser={user}>
      {children}
    </DashboardShell>
  );
}
