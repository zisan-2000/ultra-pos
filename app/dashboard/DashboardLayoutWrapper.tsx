import type { ReactNode } from "react";
import { getShopsByUser } from "@/app/actions/shops";
import { DashboardShell } from "./DashboardShell";

export async function DashboardLayoutWrapper({
  children,
}: {
  children: ReactNode;
}) {
  const shops = await getShopsByUser();
  return <DashboardShell shops={shops || []}>{children}</DashboardShell>;
}
