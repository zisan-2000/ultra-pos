"use client";

import { useSyncExternalStore } from "react";

type RealtimeStatus = {
  connected: boolean;
  lastChangeAt: number;
  lastConnectedAt: number | null;
  lastDisconnectedAt: number | null;
};

let status: RealtimeStatus = {
  connected: false,
  lastChangeAt: 0,
  lastConnectedAt: null,
  lastDisconnectedAt: null,
};

const listeners = new Set<() => void>();

export function setRealtimeStatus(connected: boolean) {
  if (status.connected === connected) return;
  const now = Date.now();
  status = {
    connected,
    lastChangeAt: now,
    lastConnectedAt: connected ? now : status.lastConnectedAt,
    lastDisconnectedAt: connected ? status.lastDisconnectedAt : now,
  };
  listeners.forEach((listener) => listener());
}

export function getRealtimeStatus(): RealtimeStatus {
  return status;
}

export function subscribeRealtimeStatus(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRealtimeStatus(): RealtimeStatus {
  return useSyncExternalStore(
    subscribeRealtimeStatus,
    getRealtimeStatus,
    getRealtimeStatus
  );
}
