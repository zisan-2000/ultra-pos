// lib/sync/sync-engine.ts

import { queueGetPending, queueRemove, queueIncrementRetry } from "./queue";
import { db } from "@/lib/dexie/db";
import { SYNC_EVENT_NAME, type SyncEventDetail } from "./sync-events";

// -----------------------------
// NETWORK STATUS CHECK
// -----------------------------
function isOnline() {
  return typeof navigator !== "undefined" && navigator.onLine;
}

let syncInFlight = false;

function emitSyncEvent(detail: SyncEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SYNC_EVENT_NAME, { detail }));
}

type AdminAction = {
  id: number;
  action: string;
  payload: any;
};

// -----------------------------
// SYNC PRODUCTS (create/update/delete)
// -----------------------------
async function syncProducts(batch: {
  newItems: any[];
  updatedItems: any[];
  deletedIds: string[];
}) {
  // API route already exists: /api/sync/products
  const res = await fetch("/api/sync/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(batch),
  });

  if (!res.ok) {
    throw new Error("Product sync failed");
  }
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

  if (!res.ok) {
    throw new Error("Sales sync failed");
  }
}

// -----------------------------
// SYNC EXPENSES
// -----------------------------
async function syncExpenses(batch: {
  newItems: any[];
  updatedItems: any[];
  deletedIds: string[];
}) {
  const res = await fetch("/api/sync/expenses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(batch),
  });

  if (!res.ok) {
    throw new Error("Expense sync failed");
  }
}

// -----------------------------
// SYNC CASH
// -----------------------------
async function syncCash(batch: {
  newItems: any[];
  updatedItems: any[];
  deletedIds: string[];
}) {
  const res = await fetch("/api/sync/cash", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(batch),
  });

  if (!res.ok) {
    throw new Error("Cash sync failed");
  }
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
  if (!res.ok) {
    throw new Error("Due sync failed");
  }
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
      })),
    }),
  });

  if (!res.ok) {
    throw new Error("Admin sync failed");
  }

  return (await res.json()) as {
    results?: Array<{ id?: number; ok?: boolean; error?: string }>;
  };
}

// -----------------------------
// MAIN SYNC ENGINE
// -----------------------------
export async function runSyncEngine() {
  if (!isOnline()) return;
  if (syncInFlight) return;

  const pending = await queueGetPending();
  if (pending.length === 0) return;

  syncInFlight = true;
  emitSyncEvent({ status: "start", at: Date.now() });
  console.log("Sync started. Pending:", pending.length);

  // Batch group
  const productCreate: any[] = [];
  const productUpdate: any[] = [];
  const productDelete: string[] = [];
  const productSyncedIds: string[] = [];
  const productDeletedIds: string[] = [];

  const salesCreate: any[] = [];
  const salesTempIds: string[] = [];
  const expenseCreate: any[] = [];
  const expenseUpdate: any[] = [];
  const expenseDelete: string[] = [];
  const expenseSyncedIds: string[] = [];
  const expenseDeletedIds: string[] = [];
  const cashCreate: any[] = [];
  const cashUpdate: any[] = [];
  const cashDelete: string[] = [];
  const cashSyncedIds: string[] = [];
  const cashDeletedIds: string[] = [];
  const dueCustomers: any[] = [];
  const dueCustomerIds: string[] = [];
  const duePayments: any[] = [];
  const dueLedgerIds: string[] = [];
  const duePaymentCustomerIds: string[] = [];
  const adminActions: AdminAction[] = [];
  const failedQueueIds = new Set<number>();

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
          productDelete.push(payload.id);
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
          expenseDelete.push(payload.id);
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
          cashDelete.push(payload.id);
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
        });
      }
    } catch (e) {
      console.error("Sync error for queue item:", e);
      if (id !== undefined) {
        failedQueueIds.add(id);
        await queueIncrementRetry(id);
      }
      continue;
    }
  }

  // --------------------------
  // SEND BATCHES TO API
  // --------------------------
  try {
    if (productCreate.length || productUpdate.length || productDelete.length) {
      await syncProducts({
        newItems: productCreate,
        updatedItems: productUpdate,
        deletedIds: productDelete,
      });
    }

    if (salesCreate.length) {
      await syncSales({
        newItems: salesCreate,
      });
    }

    if (expenseCreate.length || expenseUpdate.length || expenseDelete.length) {
      await syncExpenses({
        newItems: expenseCreate,
        updatedItems: expenseUpdate,
        deletedIds: expenseDelete,
      });
    }

    if (cashCreate.length || cashUpdate.length || cashDelete.length) {
      await syncCash({
        newItems: cashCreate,
        updatedItems: cashUpdate,
        deletedIds: cashDelete,
      });
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
        const resultMap = new Map<number, { ok: boolean }>();
        results.forEach((result) => {
          if (typeof result.id === "number") {
            resultMap.set(result.id, { ok: result.ok === true });
          }
        });

        for (const action of adminActions) {
          const result = resultMap.get(action.id);
          if (!result || !result.ok) {
            failedQueueIds.add(action.id);
            await queueIncrementRetry(action.id);
          }
        }
      } catch (err) {
        console.error("Admin sync failed:", err);
        for (const action of adminActions) {
          failedQueueIds.add(action.id);
          await queueIncrementRetry(action.id);
        }
      }
    }

    // --------------------------
    // UPDATE LOCAL CACHE
    // --------------------------
    const hasLocalUpdates =
      productSyncedIds.length ||
      productDeletedIds.length ||
      salesTempIds.length ||
      expenseSyncedIds.length ||
      expenseDeletedIds.length ||
      cashSyncedIds.length ||
      cashDeletedIds.length ||
      dueCustomerIds.length ||
      dueLedgerIds.length ||
      duePaymentCustomerIds.length;

    if (hasLocalUpdates) {
      const now = Date.now();
      try {
        await db.transaction(
          "rw",
          [db.products, db.sales, db.expenses, db.cash, db.dueCustomers, db.dueLedger],
          async () => {
            await Promise.all(
              productSyncedIds.map((pid) =>
                db.products.update(pid, { syncStatus: "synced", updatedAt: now })
              )
            );
            if (productDeletedIds.length) {
              await db.products.bulkDelete(productDeletedIds);
            }

            if (salesTempIds.length) {
              await db.sales.bulkDelete(salesTempIds);
            }

            await Promise.all(
              expenseSyncedIds.map((eid) =>
                db.expenses.update(eid, { syncStatus: "synced" })
              )
            );
            if (expenseDeletedIds.length) {
              await db.expenses.bulkDelete(expenseDeletedIds);
            }

            await Promise.all(
              cashSyncedIds.map((cid) =>
                db.cash.update(cid, { syncStatus: "synced" })
              )
            );
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

    console.log("Sync completed successfully.");
    emitSyncEvent({ status: "success", at: Date.now() });
  } catch (err) {
    console.error("Sync failed:", err);
    emitSyncEvent({
      status: "error",
      at: Date.now(),
      error: err instanceof Error ? err.message : "Sync failed",
    });
    // retry counts already incremented
  } finally {
    syncInFlight = false;
  }
}

// -----------------------------
// AUTO START (Runs when online)
// -----------------------------
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    console.log("Back online -> starting sync.");
    runSyncEngine();
  });
}
