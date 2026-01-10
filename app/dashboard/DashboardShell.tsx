"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import PosShell from "./PosShell";

type Shop = { id: string; name: string };

type RbacUser = {
  id: string;
  email: string | null;
  name: string | null;
  roles: string[];
  permissions: string[];
} | null;

type DashboardShellProps = {
  shops: Shop[];
  initialUser: RbacUser;
  children: ReactNode;
};

const DashboardChrome = dynamic<DashboardShellProps>(
  () => import("./DashboardChrome"),
  { loading: () => null }
);

export function DashboardShell({
  shops,
  initialUser,
  children,
}: DashboardShellProps) {
  const pathname = usePathname();
  const isPosRoute = pathname?.startsWith("/dashboard/sales/new");

  if (isPosRoute) {
    return (
      <PosShell shops={shops} initialUser={initialUser}>
        {children}
      </PosShell>
    );
  }

  return (
    <DashboardChrome shops={shops} initialUser={initialUser}>
      {children}
    </DashboardChrome>
  );
}
