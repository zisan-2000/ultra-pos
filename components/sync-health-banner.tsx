"use client";

import { useMemo, useState } from "react";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useSyncStatus } from "@/lib/sync/sync-status";
import { clearSyncPause } from "@/lib/sync/pause";
import { queueReviveDead } from "@/lib/sync/queue";
import { runSyncEngine } from "@/lib/sync/sync-engine";

export default function SyncHealthBanner() {
  const online = useOnlineStatus();
  const { deadCount, pausedUntil, pauseReason } = useSyncStatus();
  const [reviving, setReviving] = useState(false);

  const isPaused = useMemo(
    () => (pausedUntil ? pausedUntil > Date.now() : false),
    [pausedUntil]
  );
  const pauseLabel = useMemo(() => {
    if (!pausedUntil) return "";
    return new Intl.DateTimeFormat("bn-BD", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(pausedUntil));
  }, [pausedUntil]);

  const handleResume = async () => {
    clearSyncPause();
    if (online) {
      await runSyncEngine();
    }
  };

  const handleRetryDead = async () => {
    if (reviving) return;
    setReviving(true);
    try {
      await queueReviveDead();
      if (online) {
        await runSyncEngine();
      }
    } finally {
      setReviving(false);
    }
  };

  if (!isPaused && deadCount === 0) return null;

  return (
    <div className="space-y-2">
      {isPaused ? (
        <div className="rounded-2xl border border-warning/30 bg-warning-soft/60 px-4 py-3 text-sm text-warning-foreground shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="font-semibold text-warning">
                Sync paused
              </span>
              <span className="text-xs text-warning/80">
                {pauseReason === "auth"
                  ? `Authentication required. Resume after login (until ${pauseLabel}).`
                  : `Sync paused until ${pauseLabel}.`}
              </span>
            </div>
            <button
              type="button"
              onClick={handleResume}
              disabled={!online}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-warning/40 bg-card px-3 text-xs font-semibold text-warning hover:bg-warning/10 disabled:opacity-60"
            >
              Resume sync
            </button>
          </div>
        </div>
      ) : null}

      {deadCount > 0 ? (
        <div className="rounded-2xl border border-danger/30 bg-danger-soft/50 px-4 py-3 text-sm text-danger-foreground shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="font-semibold text-danger">
                Sync failures detected
              </span>
              <span className="text-xs text-danger/80">
                {deadCount} item(s) stopped retrying. Retry when ready.
              </span>
            </div>
            <button
              type="button"
              disabled={reviving}
              onClick={handleRetryDead}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-danger/40 bg-card px-3 text-xs font-semibold text-danger hover:bg-danger/10 disabled:opacity-60"
            >
              {reviving ? "Retrying..." : "Retry failed"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
