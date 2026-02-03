// lib/sync/sync-engine.ts

import { queueGetPending, queueRemove, queueIncrementRetry } from "./queue";
import { db } from "@/lib/dexie/db";
import { SYNC_EVENT_NAME, type SyncEventDetail } from "./sync-events";
import { clearSyncPause, getSyncPause, setSyncPause } from "./pause";
import { reportError } from "@/lib/monitoring";

const logSync = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(...args);
  }
};

// -----------------------------
// NETWORK STATUS CHECK
// -----------------------------
function isOnline() {
  return typeof navigator !== "undefined" && navigator.onLine;
}

let syncInFlight = false;

const LOCK_TTL_MS = 45_000;
const AUTH_PAUSE_MS = 5 * 60_000;
const LOCK_KEY_BASE = "offline:syncLock";
const TAB_ID_KEY = "offline:tabId";

function getTabId() {
  if (typeof window === "undefined") return "server";
  try {
    const existing = window.sessionStorage.getItem(TAB_ID_KEY);
    if (existing) return existing;
    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.sessionStorage.setItem(TAB_ID_KEY, fresh);
    return fresh;
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function getLockKey() {
  if (typeof window === "undefined") return LOCK_KEY_BASE;
  try {
    const userId = window.localStorage.getItem("offline:userId") || "anon";
    return `${LOCK_KEY_BASE}:${userId}`;
  } catch {
    return LOCK_KEY_BASE;
  }
}

function acquireLocalLock(): boolean {
  if (typeof window === "undefined") return true;
  const key = getLockKey();
  const now = Date.now();
  const tabId = getTabId();

  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as { owner: string; expiresAt: number };
      if (parsed?.expiresAt && parsed.expiresAt > now && parsed.owner !== tabId) {
        return false;
      }
    }
    const next = { owner: tabId, expiresAt: now + LOCK_TTL_MS };
    window.localStorage.setItem(key, JSON.stringify(next));
    return true;
  } catch {
    return true;
  }
}

function refreshLocalLock() {
  if (typeof window === "undefined") return;
  const key = getLockKey();
  const tabId = getTabId();
  try {
    const next = { owner: tabId, expiresAt: Date.now() + LOCK_TTL_MS };
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function releaseLocalLock() {
  if (typeof window === "undefined") return;
  const key = getLockKey();
  const tabId = getTabId();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { owner: string };
    if (parsed?.owner === tabId) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

function isSyncPaused() {
  return Boolean(getSyncPause());
}

function emitSyncEvent(detail: SyncEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SYNC_EVENT_NAME, { detail }));
}

function assertOk(res: Response, label: string) {
  if (res.status === 401 || res.status === 403) {
    throw new SyncAuthError(`${label} unauthorized`, res.status);
  }
  if (!res.ok) {
    throw new Error(`${label} failed`);
  }
}

type AdminAction = {
  id: number;
  action: string;
  payload: any;
  clientActionId?: string;
};

class SyncAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "SyncAuthError";
  }
}

type SyncConflict = {
  id: string;
  action: "update" | "delete";
  reason?: string;
  serverUpdatedAt?: string;
};

type SyncUpdatedRow = {
  id: string;
  updatedAt?: string | number | Date;
  isActive?: boolean;
  trackStock?: boolean;
};

type SyncResponse = {
  conflicts?: SyncConflict[];
  updated?: SyncUpdatedRow[];
  deleted?: string[];
  archived?: string[];
};

function toTimestamp(value?: string | number | Date | null) {
  if (!value) return Date.now();
  const d = value instanceof Date ? value : new Date(value);
  const ts = d.getTime();
  return Number.isFinite(ts) ? ts : Date.now();
}

// -----------------------------
// SYNC PRODUCTS (create/update/delete)
// -----------------------------
async function syncProducts(batch: {
  newItems: any[];
  updatedItems: any[];
  deletedIds: Array<{ id: string; updatedAt?: number | string; force?: boolean }>;
}): Promise<SyncResponse> {
  // API route already exists: /api/sync/products
  const res = await fetch("/api/sync/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(batch),
  });

  assertOk(res, "Product sync");
  const payload = (await res.json().catch(() => ({}))) as SyncResponse;
  return payload;
}

// -----------------------------
// SYNC SALES
// -----------------------------
async function syncSales(batch: { newItems: any[] }) {
  const res = await fetch("/api/sync/sales", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(batch),
  });

  assertOk(res, "Sales sync");
}

// -----------------------------
// SYNC EXPENSES
// -----------------------------
async function syncExpenses(batch: {
  newItems: any[];
  updatedItems: any[];
  deletedIds: Array<{ id: string; updatedAt?: number | string; force?: boolean }>;
}): Promise<SyncResponse> {
  const res = await fetch("/api/sync/expenses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(batch),
  });

  assertOk(res, "Expense sync");
  const payload = (await res.json().catch(() => ({}))) as SyncResponse;
  return payload;
}

// -----------------------------
// SYNC CASH
// -----------------------------
async function syncCash(batch: {
  newItems: any[];
  updatedItems: any[];
  deletedIds: Array<{ id: string; updatedAt?: number | string; force?: boolean }>;
}): Promise<SyncResponse> {
  const res = await fetch("/api/sync/cash", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(batch),
  });

  assertOk(res, "Cash sync");
  const payload = (await res.json().catch(() => ({}))) as SyncResponse;
  return payload;
}

// -----------------------------
// SYNC DUE (customers + payments)
// -----------------------------
async function syncDue(batch: { customers: any[]; payments: any[] }) {
  const res = await fetch("/api/sync/due", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(batch),
  });
  assertOk(res, "Due sync");
}

// -----------------------------
// SYNC ADMIN ACTIONS
// -----------------------------
async function syncAdminActions(actions: AdminAction[]) {
  const res = await fetch("/api/sync/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      actions: actions.map((action) => ({
        id: action.id,
        action: action.action,
        payload: action.payload,
        clientActionId: action.clientActionId,
      })),
    }),
  });

  assertOk(res, "Admin sync");

  return (await res.json()) as {
    results?: Array<{ id?: number; ok?: boolean; error?: string }>;
  };
}

// -----------------------------
// MAIN SYNC ENGINE (internal)
// -----------------------------
async function runSyncEngineInternal() {
  if (!isOnline()) return;
  if (syncInFlight) return;
  if (isSyncPaused()) return;

  const pending = await queueGetPending();
  if (pending.length === 0) return;

  syncInFlight = true;
  emitSyncEvent({ status: "start", at: Date.now() });
  logSync("Sync started. Pending:", pending.length);

  // Batch group
  const productCreate: any[] = [];
  const productUpdate: any[] = [];
  const productDelete: Array<{
    id: string;
    updatedAt?: number | string;
    force?: boolean;
  }> = [];
  let productSyncedIds: string[] = [];
  let productDeletedIds: string[] = [];
  let productSyncedUpdates: SyncUpdatedRow[] = [];
  let productArchivedIds: string[] = [];

  const salesCreate: any[] = [];
  const salesTempIds: string[] = [];
  const expenseCreate: any[] = [];
  const expenseUpdate: any[] = [];
  const expenseDelete: Array<{
    id: string;
    updatedAt?: number | string;
    force?: boolean;
  }> = [];
  let expenseSyncedIds: string[] = [];
  let expenseDeletedIds: string[] = [];
  let expenseSyncedUpdates: SyncUpdatedRow[] = [];
  const cashCreate: any[] = [];
  const cashUpdate: any[] = [];
  const cashDelete: Array<{
    id: string;
    updatedAt?: number | string;
    force?: boolean;
  }> = [];
  let cashSyncedIds: string[] = [];
  let cashDeletedIds: string[] = [];
  let cashSyncedUpdates: SyncUpdatedRow[] = [];
  const dueCustomers: any[] = [];
  const dueCustomerIds: string[] = [];
  const duePayments: any[] = [];
  const dueLedgerIds: string[] = [];
  const duePaymentCustomerIds: string[] = [];
  const adminActions: AdminAction[] = [];
  const failedQueueIds = new Set<number>();
  const productConflictActions = new Map<string, "update" | "delete">();
  const expenseConflictActions = new Map<string, "update" | "delete">();
  const cashConflictActions = new Map<string, "update" | "delete">();

  // --------------------------
  // Group items by type/action
  // --------------------------
  for (const item of pending) {
    const { id, type, action, payload } = item;

    try {
      if (type === "product") {
        if (action === "create") {
          productCreate.push(payload);
          if (payload?.id) productSyncedIds.push(payload.id);
        }
        if (action === "update") {
          productUpdate.push(payload);
          if (payload?.id) productSyncedIds.push(payload.id);
        }
        if (action === "delete") {
          if (!payload?.id) throw new Error("Missing product id for delete");
          productDelete.push({
            id: payload.id,
            updatedAt: payload?.updatedAt,
            force: payload?.force,
          });
          productDeletedIds.push(payload.id);
        }
      }

      if (type === "sale") {
        if (action === "create") {
          salesCreate.push(payload);
          const tempId = payload?.tempId || payload?.id;
          if (tempId) salesTempIds.push(tempId);
          if (Array.isArray(payload?.dueLedgerIds)) {
            payload.dueLedgerIds.forEach((lid: unknown) => {
              if (typeof lid === "string") dueLedgerIds.push(lid);
            });
          }
        }
      }

      if (type === "expense") {
        if (action === "create") {
          expenseCreate.push(payload);
          if (payload?.id) expenseSyncedIds.push(payload.id);
        }
        if (action === "update") {
          expenseUpdate.push(payload);
          if (payload?.id) expenseSyncedIds.push(payload.id);
        }
        if (action === "delete") {
          if (!payload?.id) throw new Error("Missing expense id for delete");
          expenseDelete.push({
            id: payload.id,
            updatedAt: payload?.updatedAt,
            force: payload?.force,
          });
          expenseDeletedIds.push(payload.id);
        }
      }

      if (type === "cash") {
        if (action === "create") {
          cashCreate.push(payload);
          if (payload?.id) cashSyncedIds.push(payload.id);
        }
        if (action === "update") {
          cashUpdate.push(payload);
          if (payload?.id) cashSyncedIds.push(payload.id);
        }
        if (action === "delete") {
          if (!payload?.id) throw new Error("Missing cash id for delete");
          cashDelete.push({
            id: payload.id,
            updatedAt: payload?.updatedAt,
            force: payload?.force,
          });
          cashDeletedIds.push(payload.id);
        }
      }

      if (type === "due_customer") {
        if (action === "create") {
          dueCustomers.push(payload);
          if (payload?.id) dueCustomerIds.push(payload.id);
        }
      }

      if (type === "due_payment") {
        if (action === "payment" || action === "create") {
          duePayments.push(payload);
          const localId = payload?.localId || payload?.id;
          if (localId) dueLedgerIds.push(localId);
          if (payload?.customerId) duePaymentCustomerIds.push(payload.customerId);
        }
      }

      if (type === "admin") {
        const actionName = payload?.action;
        if (!actionName) {
          throw new Error("Missing admin action");
        }
        if (actionName === "user_create") {
          if (id !== undefined) {
            await queueRemove(id);
          }
          continue;
        }
        if (id === undefined) {
          throw new Error("Missing queue id for admin action");
        }
        adminActions.push({
          id,
          action: actionName,
          payload: payload?.data ?? payload,
          clientActionId: payload?.clientActionId,
        });
      }
    } catch (e) {
      console.error("Sync error for queue item:", e);
      if (id !== undefined) {
        failedQueueIds.add(id);
        const message = e instanceof Error ? e.message : "Sync item failed";
        await queueIncrementRetry(id, { error: message });
      }
      continue;
    }
  }

  // --------------------------
  // SEND BATCHES TO API
  // --------------------------
  try {
    if (productCreate.length || productUpdate.length || productDelete.length) {
      const result = await syncProducts({
        newItems: productCreate,
        updatedItems: productUpdate,
        deletedIds: productDelete,
      });
      const conflicts = Array.isArray(result?.conflicts) ? result.conflicts : [];
      const conflictIds = new Set(conflicts.map((c) => c.id));
      if (conflicts.length > 0) {
        logSync("Product sync conflicts:", conflicts);
        const updateConflicts = new Set<string>();
        const deleteConflicts = new Set<string>();
        for (const conflict of conflicts) {
          if (conflict.action === "update") {
            updateConflicts.add(conflict.id);
            productConflictActions.set(conflict.id, "update");
          }
          if (conflict.action === "delete") {
            deleteConflicts.add(conflict.id);
            productConflictActions.set(conflict.id, "delete");
          }
        }
        if (updateConflicts.size > 0) {
          productSyncedIds = productSyncedIds.filter(
            (id) => !updateConflicts.has(id)
          );
        }
        if (deleteConflicts.size > 0) {
          productDeletedIds = productDeletedIds.filter(
            (id) => !deleteConflicts.has(id)
          );
        }
      }
      const updatedRows = Array.isArray(result?.updated) ? result.updated : [];
      const deletedRows = Array.isArray(result?.deleted) ? result.deleted : [];
      const archivedRows = Array.isArray(result?.archived) ? result.archived : [];
      if (updatedRows.length > 0) {
        productSyncedUpdates = updatedRows.filter(
          (row) => !conflictIds.has(row.id)
        );
      } else {
        productSyncedUpdates = productSyncedIds.map((id) => ({ id }));
      }
      if (deletedRows.length > 0) {
        productDeletedIds = deletedRows;
      }
      if (archivedRows.length > 0) {
        productArchivedIds = archivedRows;
        const existing = new Set(productSyncedUpdates.map((row) => row.id));
        for (const id of archivedRows) {
          if (!existing.has(id)) {
            productSyncedUpdates.push({
              id,
              isActive: false,
              trackStock: false,
            });
          }
        }
      }
    }

    if (salesCreate.length) {
      await syncSales({
        newItems: salesCreate,
      });
    }

    if (expenseCreate.length || expenseUpdate.length || expenseDelete.length) {
      const result = await syncExpenses({
        newItems: expenseCreate,
        updatedItems: expenseUpdate,
        deletedIds: expenseDelete,
      });
      const conflicts = Array.isArray(result?.conflicts) ? result.conflicts : [];
      const conflictIds = new Set(conflicts.map((c) => c.id));
      if (conflicts.length > 0) {
        logSync("Expense sync conflicts:", conflicts);
        const updateConflicts = new Set<string>();
        const deleteConflicts = new Set<string>();
        for (const conflict of conflicts) {
          if (conflict.action === "update") {
            updateConflicts.add(conflict.id);
            expenseConflictActions.set(conflict.id, "update");
          }
          if (conflict.action === "delete") {
            deleteConflicts.add(conflict.id);
            expenseConflictActions.set(conflict.id, "delete");
          }
        }
        if (updateConflicts.size > 0) {
          expenseSyncedIds = expenseSyncedIds.filter(
            (id) => !updateConflicts.has(id)
          );
        }
        if (deleteConflicts.size > 0) {
          expenseDeletedIds = expenseDeletedIds.filter(
            (id) => !deleteConflicts.has(id)
          );
        }
      }
      const updatedRows = Array.isArray(result?.updated) ? result.updated : [];
      const deletedRows = Array.isArray(result?.deleted) ? result.deleted : [];
      if (updatedRows.length > 0) {
        expenseSyncedUpdates = updatedRows.filter(
          (row) => !conflictIds.has(row.id)
        );
      } else {
        expenseSyncedUpdates = expenseSyncedIds.map((id) => ({ id }));
      }
      if (deletedRows.length > 0) {
        expenseDeletedIds = deletedRows;
      }
    }

    if (cashCreate.length || cashUpdate.length || cashDelete.length) {
      const result = await syncCash({
        newItems: cashCreate,
        updatedItems: cashUpdate,
        deletedIds: cashDelete,
      });
      const conflicts = Array.isArray(result?.conflicts) ? result.conflicts : [];
      const conflictIds = new Set(conflicts.map((c) => c.id));
      if (conflicts.length > 0) {
        logSync("Cash sync conflicts:", conflicts);
        const updateConflicts = new Set<string>();
        const deleteConflicts = new Set<string>();
        for (const conflict of conflicts) {
          if (conflict.action === "update") {
            updateConflicts.add(conflict.id);
            cashConflictActions.set(conflict.id, "update");
          }
          if (conflict.action === "delete") {
            deleteConflicts.add(conflict.id);
            cashConflictActions.set(conflict.id, "delete");
          }
        }
        if (updateConflicts.size > 0) {
          cashSyncedIds = cashSyncedIds.filter(
            (id) => !updateConflicts.has(id)
          );
        }
        if (deleteConflicts.size > 0) {
          cashDeletedIds = cashDeletedIds.filter(
            (id) => !deleteConflicts.has(id)
          );
        }
      }
      const updatedRows = Array.isArray(result?.updated) ? result.updated : [];
      const deletedRows = Array.isArray(result?.deleted) ? result.deleted : [];
      if (updatedRows.length > 0) {
        cashSyncedUpdates = updatedRows.filter((row) => !conflictIds.has(row.id));
      } else {
        cashSyncedUpdates = cashSyncedIds.map((id) => ({ id }));
      }
      if (deletedRows.length > 0) {
        cashDeletedIds = deletedRows;
      }
    }

    if (dueCustomers.length || duePayments.length) {
      await syncDue({
        customers: dueCustomers,
        payments: duePayments,
      });
    }

    if (adminActions.length) {
      try {
        const response = await syncAdminActions(adminActions);
        const results = Array.isArray(response?.results) ? response.results : [];
        const resultMap = new Map<number, { ok: boolean; error?: string }>();
        results.forEach((result) => {
          if (typeof result.id === "number") {
            resultMap.set(result.id, {
              ok: result.ok === true,
              error: result.error,
            });
          }
        });

        for (const action of adminActions) {
          const result = resultMap.get(action.id);
          if (!result || !result.ok) {
            failedQueueIds.add(action.id);
            await queueIncrementRetry(action.id, {
              error: result?.error || "Admin sync failed",
            });
          }
        }
      } catch (err) {
        console.error("Admin sync failed:", err);
        for (const action of adminActions) {
          failedQueueIds.add(action.id);
          await queueIncrementRetry(action.id, {
            error: err instanceof Error ? err.message : "Admin sync failed",
          });
        }
      }
    }

    // --------------------------
    // UPDATE LOCAL CACHE
    // --------------------------
    const hasLocalUpdates =
      productSyncedUpdates.length ||
      productDeletedIds.length ||
      productArchivedIds.length ||
      salesTempIds.length ||
      expenseSyncedUpdates.length ||
      expenseDeletedIds.length ||
      cashSyncedUpdates.length ||
      cashDeletedIds.length ||
      dueCustomerIds.length ||
      dueLedgerIds.length ||
      duePaymentCustomerIds.length ||
      productConflictActions.size ||
      expenseConflictActions.size ||
      cashConflictActions.size;

    if (hasLocalUpdates) {
      const now = Date.now();
      try {
        await db.transaction(
          "rw",
          [db.products, db.sales, db.expenses, db.cash, db.dueCustomers, db.dueLedger],
          async () => {
            if (productSyncedUpdates.length > 0) {
              const archivedSet = new Set(productArchivedIds);
              await Promise.all(
                productSyncedUpdates.map((row) => {
                  const next: Record<string, any> = {
                    syncStatus: "synced",
                    updatedAt: toTimestamp(row.updatedAt ?? now),
                    conflictAction: undefined,
                    deletedAt: undefined,
                  };
                  if (row.isActive !== undefined) next.isActive = row.isActive;
                  if (row.trackStock !== undefined) next.trackStock = row.trackStock;
                  if (archivedSet.has(row.id)) {
                    next.isActive = false;
                    next.trackStock = false;
                  }
                  return db.products.update(row.id, next);
                })
              );
            }
            if (productConflictActions.size > 0) {
              await Promise.all(
                Array.from(productConflictActions.entries()).map(
                  ([pid, action]) =>
                    db.products.update(pid, {
                      syncStatus: "conflict",
                      conflictAction: action,
                    })
                )
              );
            }
            if (productDeletedIds.length) {
              await db.products.bulkDelete(productDeletedIds);
            }

            if (salesTempIds.length) {
              await db.sales.bulkDelete(salesTempIds);
            }

            if (expenseSyncedUpdates.length > 0) {
              await Promise.all(
                expenseSyncedUpdates.map((row) =>
                  db.expenses.update(row.id, {
                    syncStatus: "synced",
                    updatedAt: toTimestamp(row.updatedAt ?? now),
                    conflictAction: undefined,
                    deletedAt: undefined,
                  })
                )
              );
            }
            if (expenseConflictActions.size > 0) {
              await Promise.all(
                Array.from(expenseConflictActions.entries()).map(
                  ([eid, action]) =>
                    db.expenses.update(eid, {
                      syncStatus: "conflict",
                      conflictAction: action,
                    })
                )
              );
            }
            if (expenseDeletedIds.length) {
              await db.expenses.bulkDelete(expenseDeletedIds);
            }

            if (cashSyncedUpdates.length > 0) {
              await Promise.all(
                cashSyncedUpdates.map((row) =>
                  db.cash.update(row.id, {
                    syncStatus: "synced",
                    updatedAt: toTimestamp(row.updatedAt ?? now),
                    conflictAction: undefined,
                    deletedAt: undefined,
                  })
                )
              );
            }
            if (cashConflictActions.size > 0) {
              await Promise.all(
                Array.from(cashConflictActions.entries()).map(
                  ([cid, action]) =>
                    db.cash.update(cid, {
                      syncStatus: "conflict",
                      conflictAction: action,
                    })
                )
              );
            }
            if (cashDeletedIds.length) {
              await db.cash.bulkDelete(cashDeletedIds);
            }

            await Promise.all(
              dueCustomerIds.map((cid) =>
                db.dueCustomers.update(cid, { syncStatus: "synced", updatedAt: now })
              )
            );

            if (dueLedgerIds.length) {
              const uniqueLedgerIds = Array.from(new Set(dueLedgerIds));
              await Promise.all(
                uniqueLedgerIds.map((lid) =>
                  db.dueLedger.update(lid, { syncStatus: "synced" })
                )
              );
            }

            if (duePaymentCustomerIds.length) {
              const uniqueCustomerIds = Array.from(
                new Set(duePaymentCustomerIds)
              );
              await Promise.all(
                uniqueCustomerIds.map((cid) =>
                  db.dueCustomers.update(cid, { syncStatus: "synced", updatedAt: now })
                )
              );
            }
          }
        );
      } catch (err) {
        console.error("Local sync cache update failed", err);
      }
    }

    // --------------------------
    // CLEAN QUEUE AFTER SUCCESS
    // --------------------------
    for (const item of pending) {
      if (item.id !== undefined && failedQueueIds.has(item.id)) continue;
      await queueRemove(item.id!);
    }

    clearSyncPause();
    logSync("Sync completed successfully.");
    emitSyncEvent({ status: "success", at: Date.now() });
  } catch (err) {
    console.error("Sync failed:", err);
    if (err instanceof SyncAuthError) {
      setSyncPause("auth", AUTH_PAUSE_MS);
      emitSyncEvent({
        status: "error",
        at: Date.now(),
        error: "Authentication required. Sync paused.",
      });
      return;
    }
    const message = err instanceof Error ? err.message : "Sync failed";
    emitSyncEvent({
      status: "error",
      at: Date.now(),
      error: message,
    });
    void reportError(err, { source: "offline-sync" });
    // Best-effort retry backoff for any items not already marked failed.
    for (const item of pending) {
      if (item.id === undefined) continue;
      if (failedQueueIds.has(item.id)) continue;
      await queueIncrementRetry(item.id, { error: message });
    }
  } finally {
    syncInFlight = false;
  }
}

// -----------------------------
// MAIN SYNC ENGINE (with lock + pause)
// -----------------------------
export async function runSyncEngine() {
  if (!isOnline()) return;
  if (syncInFlight) return;
  if (isSyncPaused()) return;

  const run = async () => {
    refreshLocalLock();
    return runSyncEngineInternal();
  };

  if (
    typeof navigator !== "undefined" &&
    "locks" in navigator &&
    typeof (navigator as any).locks?.request === "function"
  ) {
    return (navigator as any).locks.request("pos-sync", { mode: "exclusive" }, run);
  }

  if (!acquireLocalLock()) return;
  try {
    await run();
  } finally {
    releaseLocalLock();
  }
}

// -----------------------------
// AUTO START (Runs when online)
// -----------------------------
if (typeof window !== "undefined") {
  const g = window as Window & { __posSyncOnlineListener?: boolean };
  if (!g.__posSyncOnlineListener) {
    g.__posSyncOnlineListener = true;
    window.addEventListener("online", () => {
      logSync("Back online -> starting sync.");
      runSyncEngine();
    });
  }
}
