// lib/sync/queue.ts

import { db } from "@/lib/dexie/db";
import type { SyncQueueItem } from "@/lib/dexie/db";

// ---------------------------------------------
// ADD ITEM TO QUEUE
// ---------------------------------------------
export async function queueAdd(
  type: SyncQueueItem["type"],
  action: SyncQueueItem["action"],
  payload: any
) {
  await db.queue.add({
    type,
    action,
    payload,
    createdAt: Date.now(),
    retryCount: 0,
  });
}

// ---------------------------------------------
// ADD ADMIN ACTION TO QUEUE
// ---------------------------------------------
export async function queueAdminAction(action: string, payload: any) {
  await queueAdd("admin", "admin", { action, data: payload });
}

// ---------------------------------------------
// GET ALL PENDING ITEMS
// (Oldest first for FIFO processing)
// ---------------------------------------------
export async function queueGetPending(): Promise<SyncQueueItem[]> {
  return db.queue.orderBy("createdAt").toArray();
}

// ---------------------------------------------
// REMOVE ITEM FROM QUEUE
// ---------------------------------------------
export async function queueRemove(id: number) {
  await db.queue.delete(id);
}

// ---------------------------------------------
// RETRY INCREMENT
// Called if sync failed (network/server issue)
// ---------------------------------------------
export async function queueIncrementRetry(id: number) {
  const item = await db.queue.get(id);
  if (!item) return;

  await db.queue.update(id, {
    retryCount: item.retryCount + 1,
  });
}

// ---------------------------------------------
// CLEAR ENTIRE QUEUE (rarely used)
// ---------------------------------------------
export async function queueClear() {
  await db.queue.clear();
}

// ---------------------------------------------
// REMOVE EXPENSE QUEUE ITEMS BY EXPENSE ID
// (used when a local-only expense is deleted before sync)
// ---------------------------------------------
export async function queueRemoveExpenseById(expenseId: string) {
  if (!expenseId) return;
  const items = await db.queue.where("type").equals("expense").toArray();
  const matches = items.filter((item) => item.payload?.id === expenseId);
  await Promise.all(
    matches.map((item) => (item.id !== undefined ? db.queue.delete(item.id) : Promise.resolve()))
  );
}
