// app/owner/layout.tsx

import type { ReactNode } from "react";
import { DashboardLayoutWrapper } from "@/app/dashboard/DashboardLayoutWrapper";

export default async function OwnerLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <DashboardLayoutWrapper>{children}</DashboardLayoutWrapper>;
}
