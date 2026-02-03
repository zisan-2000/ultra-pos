"use client";

import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { db } from "@/lib/dexie/db";
import { SYNC_EVENT_NAME, type SyncEventDetail } from "./sync-events";
import { getSyncPause } from "./pause";

type SyncStatus = {
  pendingCount: number;
  deadCount: number;
  syncing: boolean;
  lastSyncAt: number | null;
  lastError: string | null;
  pausedUntil: number | null;
  pauseReason: string | null;
};

export function useSyncStatus(): SyncStatus {
  const [pendingCount, setPendingCount] = useState(0);
  const [deadCount, setDeadCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [pausedUntil, setPausedUntil] = useState<number | null>(null);
  const [pauseReason, setPauseReason] = useState<string | null>(null);

  useEffect(() => {
    const sub = liveQuery(() => db.queue.count()).subscribe({
      next: (count) => setPendingCount(count ?? 0),
      error: (err) => console.error("Queue liveQuery failed", err),
    });
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    const sub = liveQuery(() =>
      db.queue.filter((item) => item.dead === true).count()
    ).subscribe({
      next: (count) => setDeadCount(count ?? 0),
      error: (err) => console.error("Dead queue liveQuery failed", err),
    });
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<SyncEventDetail>).detail;
      if (!detail) return;

      if (detail.status === "start") {
        setSyncing(true);
        setLastError(null);
      } else if (detail.status === "success") {
        setSyncing(false);
        setLastSyncAt(detail.at);
        setLastError(null);
      } else if (detail.status === "error") {
        setSyncing(false);
        setLastError(detail.error || "Sync failed");
      }
    };

    window.addEventListener(SYNC_EVENT_NAME, handler);
    return () => window.removeEventListener(SYNC_EVENT_NAME, handler);
  }, []);

  useEffect(() => {
    const readPause = () => {
      const pause = getSyncPause();
      setPausedUntil(pause?.until ?? null);
      setPauseReason(pause?.reason ?? null);
    };
    readPause();
    const id = setInterval(readPause, 30_000);
    const onStorage = (event: StorageEvent) => {
      if (!event.key || !event.key.includes("offline:syncPause")) return;
      readPause();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      clearInterval(id);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return {
    pendingCount,
    deadCount,
    syncing,
    lastSyncAt,
    lastError,
    pausedUntil,
    pauseReason,
  };
}
