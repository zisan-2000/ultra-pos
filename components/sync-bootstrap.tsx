"use client";

// Triggers the offline sync engine on mount and at an interval.

import { useEffect } from "react";
import { runSyncEngine } from "@/lib/sync/sync-engine";

const SYNC_INTERVAL_MS = 45_000;

export default function SyncBootstrap() {
  useEffect(() => {
    let cancelled = false;

    const runSafe = async () => {
      try {
        await runSyncEngine();
      } catch (err) {
        // Keep silent in UI, just log for debugging.
        console.error("runSyncEngine failed", err);
      }
    };

    runSafe();

    const id = setInterval(() => {
      if (!cancelled) runSafe();
    }, SYNC_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        runSafe();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const handleMessage = (event: MessageEvent) => {
      if (event?.data?.type === "POS_SYNC") {
        runSafe();
      }
    };
    navigator.serviceWorker?.addEventListener("message", handleMessage);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", handleVisibility);
      navigator.serviceWorker?.removeEventListener("message", handleMessage);
    };
  }, []);

  return null;
}
