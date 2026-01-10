"use client";

import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { db } from "@/lib/dexie/db";
import { SYNC_EVENT_NAME, type SyncEventDetail } from "./sync-events";

type SyncStatus = {
  pendingCount: number;
  syncing: boolean;
  lastSyncAt: number | null;
  lastError: string | null;
};

export function useSyncStatus(): SyncStatus {
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    const sub = liveQuery(() => db.queue.count()).subscribe({
      next: (count) => setPendingCount(count ?? 0),
      error: (err) => console.error("Queue liveQuery failed", err),
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

  return { pendingCount, syncing, lastSyncAt, lastError };
}
