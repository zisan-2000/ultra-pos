// lib/sync/sync-events.ts

export const SYNC_EVENT_NAME = "pos:sync";

export type SyncEventDetail = {
  status: "start" | "success" | "error";
  at: number;
  error?: string;
};
