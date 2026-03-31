"use client";

type RealtimeStatus = {
  connected: boolean;
  lastChangeAt: number;
  lastConnectedAt: number | null;
  lastDisconnectedAt: number | null;
};

const status: RealtimeStatus = {
  connected: false,
  lastChangeAt: 0,
  lastConnectedAt: null,
  lastDisconnectedAt: null,
};

export function setRealtimeStatus(_connected: boolean) {
  // Polling-only mode: realtime is intentionally disabled.
}

export function getRealtimeStatus(): RealtimeStatus {
  return status;
}

export function subscribeRealtimeStatus(_listener: () => void) {
  return () => {};
}

export function useRealtimeStatus(): RealtimeStatus {
  return status;
}
