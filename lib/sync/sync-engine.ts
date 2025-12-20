// lib/sync/sync-engine.ts

import { queueGetPending, queueRemove, queueIncrementRetry } from "./queue";
import { db } from "@/lib/dexie/db";

// -----------------------------
// NETWORK STATUS CHECK
// -----------------------------
function isOnline() {
  return typeof navigator !== "undefined" && navigator.onLine;
}

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
async function syncExpenses(batch: { newItems: any[] }) {
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
async function syncCash(batch: { newItems: any[] }) {
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
// MAIN SYNC ENGINE
// -----------------------------
export async function runSyncEngine() {
  if (!isOnline()) return;

  const pending = await queueGetPending();
  if (pending.length === 0) return;

  console.log("🔄 Sync started… Pending:", pending.length);

  // Batch group
  const productCreate: any[] = [];
  const productUpdate: any[] = [];
  const productDelete: string[] = [];

  const salesCreate: any[] = [];
  const expenseCreate: any[] = [];
  const cashCreate: any[] = [];
  const dueCustomers: any[] = [];
  const duePayments: any[] = [];

  // --------------------------
  // Group items by type/action
  // --------------------------
  for (const item of pending) {
    const { id, type, action, payload } = item;

    try {
      if (type === "product") {
        if (action === "create") productCreate.push(payload);
        if (action === "update") productUpdate.push(payload);
        if (action === "delete") productDelete.push(payload.id);
      }

      if (type === "sale") {
        if (action === "create") salesCreate.push(payload);
      }

      if (type === "expense") {
        if (action === "create") expenseCreate.push(payload);
      }

      if (type === "cash") {
        if (action === "create") cashCreate.push(payload);
      }

      if (type === "due_customer") {
        if (action === "create") dueCustomers.push(payload);
      }

      if (type === "due_payment") {
        if (action === "payment" || action === "create") duePayments.push(payload);
      }
    } catch (e) {
      console.error("Sync error for queue item:", e);
      await queueIncrementRetry(id!);
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

    if (expenseCreate.length) {
      await syncExpenses({
        newItems: expenseCreate,
      });
    }

    if (cashCreate.length) {
      await syncCash({
        newItems: cashCreate,
      });
    }

    if (dueCustomers.length || duePayments.length) {
      await syncDue({
        customers: dueCustomers,
        payments: duePayments,
      });
    }

    // --------------------------
    // CLEAN QUEUE AFTER SUCCESS
    // --------------------------
    for (const item of pending) {
      await queueRemove(item.id!);
    }

    console.log("✅ Sync completed successfully.");
  } catch (err) {
    console.error("❌ Sync failed:", err);
    // retry counts already incremented
  }
}

// -----------------------------
// AUTO START (Runs when online)
// -----------------------------
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    console.log("🌐 Back online → starting sync…");
    runSyncEngine();
  });
}
