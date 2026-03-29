"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useSyncStatus } from "@/lib/sync/sync-status";
import { clearSyncPause } from "@/lib/sync/pause";
import { queueReviveDead } from "@/lib/sync/queue";
import { runSyncEngine } from "@/lib/sync/sync-engine";
import { useSyncQueueDetails } from "@/lib/sync/use-sync-queue-details";

export default function SyncHealthBanner() {
  const online = useOnlineStatus();
  const { deadCount, pausedUntil, pauseReason, pendingCount, lastError, syncing } =
    useSyncStatus();
  const { breakdown, deadItems } = useSyncQueueDetails();
  const [reviving, setReviving] = useState(false);
  const [forcing, setForcing] = useState(false);

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

  const handleForceSync = async () => {
    if (forcing || !online) return;
    setForcing(true);
    try {
      await runSyncEngine();
    } finally {
      setForcing(false);
    }
  };

  if (!isPaused && deadCount === 0 && pendingCount === 0 && !lastError) return null;

  const pendingBadges = Object.entries(breakdown)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${type}: ${count}`);

  return (
    <div className="space-y-2">
      {pendingCount > 0 ? (
        <div className="rounded-2xl border border-primary/20 bg-primary-soft/50 px-4 py-3 text-sm text-primary-foreground shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-primary">
                Sync queue active
              </span>
              <span className="text-xs text-primary/80">
                {pendingCount} item(s) waiting
                {syncing ? " and syncing now." : "."}
              </span>
              {pendingBadges.length > 0 ? (
                <span className="text-[11px] text-primary/75">
                  {pendingBadges.join(" • ")}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleForceSync}
                disabled={!online || forcing}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-primary/40 bg-card px-3 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-60"
              >
                {forcing ? "Syncing..." : "Force sync"}
              </button>
              <Link
                href="/offline"
                className="inline-flex h-9 items-center justify-center rounded-xl border border-primary/30 bg-card px-3 text-xs font-semibold text-primary hover:bg-primary/10"
              >
                Offline center
              </Link>
            </div>
          </div>
        </div>
      ) : null}

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
              {deadItems[0]?.error ? (
                <span className="text-[11px] text-danger/75">
                  Latest: {deadItems[0].type} {deadItems[0].action} - {deadItems[0].error}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={reviving}
                onClick={handleRetryDead}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-danger/40 bg-card px-3 text-xs font-semibold text-danger hover:bg-danger/10 disabled:opacity-60"
              >
                {reviving ? "Retrying..." : "Retry failed"}
              </button>
              <Link
                href="/offline/conflicts"
                className="inline-flex h-9 items-center justify-center rounded-xl border border-danger/30 bg-card px-3 text-xs font-semibold text-danger hover:bg-danger/10"
              >
                Review issues
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {lastError && deadCount === 0 ? (
        <div className="rounded-2xl border border-warning/30 bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="font-semibold text-foreground">
                Last sync issue
              </span>
              <span className="text-xs">{lastError}</span>
            </div>
            <button
              type="button"
              onClick={handleForceSync}
              disabled={!online || forcing}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-60"
            >
              {forcing ? "Syncing..." : "Try again"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
