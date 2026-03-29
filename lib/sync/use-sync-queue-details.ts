"use client";

import { useEffect, useMemo, useState } from "react";
import { liveQuery } from "dexie";
import { db, type SyncQueueItem } from "@/lib/dexie/db";

type QueueBreakdown = Record<SyncQueueItem["type"], number>;

export type SyncQueueIssue = {
  id: number;
  type: SyncQueueItem["type"];
  action: SyncQueueItem["action"];
  error: string | null;
  retryCount: number;
  createdAt: number;
};

const emptyBreakdown: QueueBreakdown = {
  product: 0,
  sale: 0,
  expense: 0,
  cash: 0,
  due_customer: 0,
  due_payment: 0,
  admin: 0,
};

export function useSyncQueueDetails() {
  const [items, setItems] = useState<SyncQueueItem[]>([]);

  useEffect(() => {
    const sub = liveQuery(() => db.queue.orderBy("createdAt").toArray()).subscribe({
      next: (next) => setItems(next ?? []),
      error: (err) => console.error("Queue details liveQuery failed", err),
    });
    return () => sub.unsubscribe();
  }, []);

  const breakdown = useMemo(() => {
    const next = { ...emptyBreakdown };
    items.forEach((item) => {
      next[item.type] += 1;
    });
    return next;
  }, [items]);

  const deadItems = useMemo<SyncQueueIssue[]>(
    () =>
      items
        .filter((item) => item.dead && item.id !== undefined)
        .map((item) => ({
          id: item.id as number,
          type: item.type,
          action: item.action,
          error: item.lastError ?? null,
          retryCount: item.retryCount ?? 0,
          createdAt: item.createdAt,
        })),
    [items]
  );

  const pendingItems = useMemo<SyncQueueIssue[]>(
    () =>
      items
        .filter((item) => !item.dead && item.id !== undefined)
        .map((item) => ({
          id: item.id as number,
          type: item.type,
          action: item.action,
          error: item.lastError ?? null,
          retryCount: item.retryCount ?? 0,
          createdAt: item.createdAt,
        })),
    [items]
  );

  return {
    items,
    breakdown,
    deadItems,
    pendingItems,
  };
}
