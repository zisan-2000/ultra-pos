// lib/sync/queue.ts

import { db } from "@/lib/dexie/db";
import type { SyncQueueItem } from "@/lib/dexie/db";

const BASE_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;
const MAX_RETRIES = 8;
const JITTER_RATIO = 0.3;

function computeRetryDelay(retryCount: number) {
  const expo = Math.min(retryCount, 6);
  const base = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * 2 ** expo);
  const jitter = 1 + (Math.random() * 2 - 1) * JITTER_RATIO;
  return Math.max(1_000, Math.floor(base * jitter));
}

async function requestBackgroundSync() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const syncManager = (registration as any).sync;
    if (!syncManager || typeof syncManager.register !== "function") return;
    await syncManager.register("pos-sync");
  } catch {
    // Ignore: unsupported or permission denied.
  }
}

const DEDUPE_TYPES = new Set<SyncQueueItem["type"]>([
  "product",
  "expense",
  "cash",
  "due_customer",
]);

function extractEntityKey(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  return payload.id || payload.tempId || payload.localId || null;
}

function matchesEntity(item: SyncQueueItem, entityId: string) {
  const payload = item.payload ?? {};
  return (
    payload.id === entityId ||
    payload.tempId === entityId ||
    payload.localId === entityId
  );
}

async function dedupeQueueItem(
  type: SyncQueueItem["type"],
  action: SyncQueueItem["action"],
  payload: any
) {
  if (!DEDUPE_TYPES.has(type)) return { handled: false };
  const entityId = extractEntityKey(payload);
  if (!entityId) return { handled: false };

  const items = await db.queue.where("type").equals(type).toArray();
  const matches = items.filter((item) => matchesEntity(item, entityId));
  if (matches.length === 0) return { handled: false };

  const existingCreate = matches.find((item) => item.action === "create");
  const existingUpdate = matches.find((item) => item.action === "update");
  const existingDelete = matches.find((item) => item.action === "delete");

  if (action === "create") {
    if (existingDelete?.id !== undefined) {
      await db.queue.delete(existingDelete.id);
    }
    if (existingUpdate?.id !== undefined) {
      await db.queue.delete(existingUpdate.id);
    }
    if (existingCreate?.id !== undefined) {
      await db.queue.update(existingCreate.id, {
        payload: { ...(existingCreate.payload ?? {}), ...(payload ?? {}) },
      });
      return { handled: true };
    }
    return { handled: false };
  }

  if (action === "update") {
    if (existingDelete?.id !== undefined) {
      await db.queue.delete(existingDelete.id);
    }
    if (existingCreate?.id !== undefined) {
      await db.queue.update(existingCreate.id, {
        payload: { ...(existingCreate.payload ?? {}), ...(payload ?? {}) },
      });
      return { handled: true };
    }
    if (existingUpdate?.id !== undefined) {
      await db.queue.update(existingUpdate.id, {
        payload: { ...(existingUpdate.payload ?? {}), ...(payload ?? {}) },
      });
      return { handled: true };
    }
    return { handled: false };
  }

  if (action === "delete") {
    if (existingCreate?.id !== undefined) {
      await db.queue.delete(existingCreate.id);
      return { handled: true };
    }
    if (existingUpdate?.id !== undefined) {
      await db.queue.delete(existingUpdate.id);
    }
    if (existingDelete?.id !== undefined) {
      return { handled: true };
    }
    return { handled: false };
  }

  return { handled: false };
}

// ---------------------------------------------
// ADD ITEM TO QUEUE
// ---------------------------------------------
export async function queueAdd(
  type: SyncQueueItem["type"],
  action: SyncQueueItem["action"],
  payload: any
) {
  if (type === "due_payment") {
    const entityId = extractEntityKey(payload);
    if (entityId) {
      const items = await db.queue.where("type").equals(type).toArray();
      const existing = items.find((item) => matchesEntity(item, entityId));
      if (existing) {
        void requestBackgroundSync();
        return;
      }
    }
  }
  if (type !== "sale" && type !== "admin") {
    const { handled } = await dedupeQueueItem(type, action, payload);
    if (handled) {
      void requestBackgroundSync();
      return;
    }
  }
  await db.queue.add({
    type,
    action,
    payload,
    createdAt: Date.now(),
    retryCount: 0,
    nextAttemptAt: Date.now(),
  });
  void requestBackgroundSync();
}

// ---------------------------------------------
// ADD ADMIN ACTION TO QUEUE
// ---------------------------------------------
export async function queueAdminAction(action: string, payload: any) {
  const clientActionId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : generateUuidFallback();
  await queueAdd("admin", "admin", { action, data: payload, clientActionId });
}

function generateUuidFallback() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16;
    const v = c === "x" ? r : (r % 4) + 8;
    return Math.floor(v).toString(16);
  });
}

// ---------------------------------------------
// GET ALL PENDING ITEMS
// (Oldest first for FIFO processing)
// ---------------------------------------------
export async function queueGetPending(): Promise<SyncQueueItem[]> {
  const now = Date.now();
  const items = await db.queue.orderBy("createdAt").toArray();
  return items.filter(
    (item) => !item.dead && (item.nextAttemptAt ?? 0) <= now
  );
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
export async function queueIncrementRetry(
  id: number,
  options?: { error?: string; fatal?: boolean }
) {
  const item = await db.queue.get(id);
  if (!item) return;
  if (item.dead) return;

  const nextRetry = item.retryCount + 1;
  if (options?.fatal || nextRetry >= MAX_RETRIES) {
    await db.queue.update(id, {
      retryCount: nextRetry,
      dead: true,
      lastError:
        options?.error ||
        item.lastError ||
        (options?.fatal ? "Fatal error" : "Max retries exceeded"),
    });
    return;
  }
  const delay = computeRetryDelay(nextRetry);

  await db.queue.update(id, {
    retryCount: nextRetry,
    nextAttemptAt: Date.now() + delay,
    lastError: options?.error ?? item.lastError,
  });
}

// ---------------------------------------------
// CLEAR ENTIRE QUEUE (rarely used)
// ---------------------------------------------
export async function queueClear() {
  await db.queue.clear();
}

// ---------------------------------------------
// REVIVE DEAD ITEMS
// ---------------------------------------------
export async function queueReviveDead() {
  const items = await db.queue.filter((item) => item.dead === true).toArray();
  const now = Date.now();
  await Promise.all(
    items.map((item) =>
      item.id !== undefined
        ? db.queue.update(item.id, {
            dead: false,
            retryCount: 0,
            nextAttemptAt: now,
            lastError: undefined,
          })
        : Promise.resolve()
    )
  );
  void requestBackgroundSync();
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

// ---------------------------------------------
// REMOVE QUEUE ITEMS BY TYPE + ENTITY ID
// ---------------------------------------------
export async function queueRemoveByTypeAndId(
  type: SyncQueueItem["type"],
  entityId: string
) {
  if (!entityId) return;
  const items = await db.queue.where("type").equals(type).toArray();
  const matches = items.filter((item) => {
    const payload = item.payload ?? {};
    return (
      payload.id === entityId ||
      payload.tempId === entityId ||
      payload.localId === entityId
    );
  });
  await Promise.all(
    matches.map((item) => (item.id !== undefined ? db.queue.delete(item.id) : Promise.resolve()))
  );
}
