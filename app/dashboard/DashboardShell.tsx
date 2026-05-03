"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";

type Shop = {
  id: string;
  name: string;
  closingTime?: string | null;
  businessType?: string | null;
};

type RbacUser = {
  id: string;
  email: string | null;
  name: string | null;
  roles: string[];
  permissions: string[];
  actorUserId?: string;
  effectiveUserId?: string;
  sessionId?: string | null;
  isImpersonating?: boolean;
  impersonatedBy?: string | null;
  impersonatorName?: string | null;
  impersonatorEmail?: string | null;
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
  return (
    <DashboardChrome shops={shops} initialUser={initialUser}>
      {children}
    </DashboardChrome>
  );
}
