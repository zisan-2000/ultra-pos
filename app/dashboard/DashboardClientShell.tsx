"use client";

import { useEffect, type ReactNode } from "react";
import SyncBootstrap from "@/components/sync-bootstrap";
import RealtimeBridge from "@/components/realtime/RealtimeBridge";
import { handlePermissionError } from "@/lib/permission-toast";
import OfflineConflictBanner from "@/components/offline-conflict-banner";
import SyncHealthBanner from "@/components/sync-health-banner";

export default function DashboardClientShell({
  children,
}: {
  children: ReactNode;
}) {
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      if (handlePermissionError(event.reason)) {
        event.preventDefault();
      }
    };
    const handleError = (event: ErrorEvent) => {
      if (handlePermissionError(event.error ?? event.message)) {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", handleRejection);
    window.addEventListener("error", handleError);
    return () => {
      window.removeEventListener("unhandledrejection", handleRejection);
      window.removeEventListener("error", handleError);
    };
  }, []);

  return (
    <>
      <SyncBootstrap />
      <RealtimeBridge />
      <div className="px-4 pt-3">
        <SyncHealthBanner />
        <OfflineConflictBanner />
      </div>
      {children}
    </>
  );
}
