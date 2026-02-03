"use client";

import {
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
} from "@/lib/storage";

export type SyncPauseState = {
  until: number;
  reason: string;
};

const SYNC_PAUSE_KEY = "offline:syncPause";

export function getSyncPause(): SyncPauseState | null {
  const raw = safeLocalStorageGet(SYNC_PAUSE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SyncPauseState;
    if (!parsed || typeof parsed.until !== "number") return null;
    if (parsed.until <= Date.now()) {
      clearSyncPause();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setSyncPause(reason: string, ttlMs: number) {
  const payload: SyncPauseState = {
    reason,
    until: Date.now() + ttlMs,
  };
  safeLocalStorageSet(SYNC_PAUSE_KEY, JSON.stringify(payload));
}

export function clearSyncPause() {
  safeLocalStorageRemove(SYNC_PAUSE_KEY);
}
