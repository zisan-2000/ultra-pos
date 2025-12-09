import type { ReactNode } from "react";
import { DashboardLayoutWrapper } from "@/app/dashboard/DashboardLayoutWrapper";

export default async function StaffLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <DashboardLayoutWrapper>{children}</DashboardLayoutWrapper>;
}
