"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import SyncBootstrap from "@/components/sync-bootstrap";
import OfflineSessionGuard from "@/components/offline-session-guard";
import OfflineCapabilityGuard from "@/components/offline-capability-guard";
import { handlePermissionError } from "@/lib/permission-toast";
import OfflineConflictBanner from "@/components/offline-conflict-banner";
import SyncHealthBanner from "@/components/sync-health-banner";
import FloatingCopilotLauncher from "@/components/copilot/FloatingCopilotLauncher";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useCurrentShop } from "@/hooks/use-current-shop";
import {
  getLastOfflinePreparedAt,
  prepareOfflineForShop,
} from "@/lib/offline/prepare";
import { isOfflineCapableRoute } from "@/lib/offline/offline-capable-routes";
import { markOfflineRouteReady } from "@/lib/offline/route-readiness";

const AUTO_PREPARE_INTERVAL_MS = 5 * 60 * 1000;

export default function DashboardClientShell({
  children,
  showCopilot = true,
}: {
  children: ReactNode;
  showCopilot?: boolean;
}) {
  const online = useOnlineStatus();
  const pathname = usePathname();
  const { shopId } = useCurrentShop();

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

  useEffect(() => {
    if (!online) return;
    const maybePrepare = () => {
      const lastPreparedAt = getLastOfflinePreparedAt(shopId);
      if (
        lastPreparedAt &&
        Date.now() - lastPreparedAt < AUTO_PREPARE_INTERVAL_MS
      ) {
        return;
      }
      void prepareOfflineForShop(shopId, { runSync: true });
    };

    maybePrepare();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        maybePrepare();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [online, shopId]);

  useEffect(() => {
    if (!online || !pathname) return;
    if (!isOfflineCapableRoute(pathname)) return;
    markOfflineRouteReady(pathname);
  }, [online, pathname]);

  return (
    <>
      <OfflineSessionGuard />
      <OfflineCapabilityGuard />
      <SyncBootstrap />
      <div className="px-4 pt-3">
        <SyncHealthBanner />
        <OfflineConflictBanner />
      </div>
      {showCopilot ? <FloatingCopilotLauncher /> : null}
      {children}
    </>
  );
}
