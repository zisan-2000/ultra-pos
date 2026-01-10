"use client";

import type { ReactNode } from "react";
import ServiceWorkerRegister from "@/components/service-worker-register";
import SyncBootstrap from "@/components/sync-bootstrap";

export default function DashboardClientShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <ServiceWorkerRegister />
      <SyncBootstrap />
      {children}
    </>
  );
}
