import type { ReactNode } from "react";
import { DashboardLayoutWrapper } from "@/app/dashboard/DashboardLayoutWrapper";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <DashboardLayoutWrapper>{children}</DashboardLayoutWrapper>;
}
