"use client";

import { useEffect, useMemo, useState } from "react";
import { liveQuery } from "dexie";
import Link from "next/link";
import { db, type LocalProduct, type LocalExpense, type LocalCashEntry } from "@/lib/dexie/db";
import { queueAdd, queueRemoveByTypeAndId } from "@/lib/sync/queue";
import { useOnlineStatus } from "@/lib/sync/net-status";

type ConflictRow = {
  id: string;
  type: "product" | "expense" | "cash";
  action: "update" | "delete";
  title: string;
  subtitle: string;
  local: LocalProduct | LocalExpense | LocalCashEntry;
};

type ConflictState = {
  loading: boolean;
  items: ConflictRow[];
};

const emptyState: ConflictState = { loading: true, items: [] };

const toTimestamp = (value?: string | number | Date | null) => {
  if (!value) return Date.now();
  const d = value instanceof Date ? value : new Date(value);
  const ts = d.getTime();
  return Number.isFinite(ts) ? ts : Date.now();
};

export default function ConflictsClient() {
  const online = useOnlineStatus();
  const [state, setState] = useState<ConflictState>(emptyState);

  useEffect(() => {
    const sub = liveQuery(async () => {
      const [products, expenses, cash] = await Promise.all([
        db.products.where("syncStatus").equals("conflict").toArray(),
        db.expenses.where("syncStatus").equals("conflict").toArray(),
        db.cash.where("syncStatus").equals("conflict").toArray(),
      ]);

      const items: ConflictRow[] = [];

      products.forEach((p) => {
        items.push({
          id: p.id,
          type: "product",
          action: p.conflictAction ?? "update",
          title: p.name,
          subtitle: `Category: ${p.category || "Uncategorized"}`,
          local: p,
        });
      });

      expenses.forEach((e) => {
        items.push({
          id: e.id,
          type: "expense",
          action: e.conflictAction ?? "update",
          title: `${Number(e.amount || 0).toFixed(2)} expense`,
          subtitle: e.category || "Uncategorized",
          local: e,
        });
      });

      cash.forEach((c) => {
        items.push({
          id: c.id,
          type: "cash",
          action: c.conflictAction ?? "update",
          title: `${c.entryType || "IN"} ৳${Number(c.amount || 0).toFixed(2)}`,
          subtitle: c.reason || "Cash entry",
          local: c,
        });
      });

      return { loading: false, items };
    }).subscribe({
      next: (next) => setState(next),
      error: () => setState({ loading: false, items: [] }),
    });

    return () => sub.unsubscribe();
  }, []);

  const grouped = useMemo(() => {
    const map: Record<string, ConflictRow[]> = {
      product: [],
      expense: [],
      cash: [],
    };
    state.items.forEach((item) => map[item.type].push(item));
    return map;
  }, [state.items]);

  const resolveUseServer = async (item: ConflictRow) => {
    if (!online) return;
    const res = await fetch(`/api/offline/${item.type}/${item.id}`, {
      cache: "no-store",
    });

    await db.transaction(
      "rw",
      item.type === "product" ? db.products : item.type === "expense" ? db.expenses : db.cash,
      db.queue,
      async () => {
        await queueRemoveByTypeAndId(item.type, item.id);

        if (!res.ok) {
          if (item.type === "product") await db.products.delete(item.id);
          if (item.type === "expense") await db.expenses.delete(item.id);
          if (item.type === "cash") await db.cash.delete(item.id);
          return;
        }

        const server = await res.json();

        if (item.type === "product") {
          const next: LocalProduct = {
            id: server.id,
            shopId: server.shopId,
            name: server.name,
            category: server.category,
            buyPrice: server.buyPrice ?? null,
            sellPrice: server.sellPrice,
            stockQty: server.stockQty,
            isActive: server.isActive,
            trackStock: server.trackStock ?? false,
            updatedAt: toTimestamp(server.updatedAt),
            syncStatus: "synced",
          };
          await db.products.put(next);
        }

        if (item.type === "expense") {
          const next: LocalExpense = {
            id: server.id,
            shopId: server.shopId,
            amount: server.amount,
            category: server.category,
            note: server.note ?? "",
            expenseDate: server.expenseDate,
            createdAt: toTimestamp(server.createdAt),
            updatedAt: toTimestamp(server.updatedAt),
            syncStatus: "synced",
          };
          await db.expenses.put(next as any);
        }

        if (item.type === "cash") {
          const next: LocalCashEntry = {
            id: server.id,
            shopId: server.shopId,
            entryType: server.entryType,
            amount: server.amount,
            reason: server.reason ?? "",
            createdAt: toTimestamp(server.createdAt),
            updatedAt: toTimestamp(server.updatedAt),
            syncStatus: "synced",
          };
          await db.cash.put(next as any);
        }
      }
    );
  };

  const resolveKeepLocal = async (item: ConflictRow) => {
    const now = Date.now();
    await db.transaction(
      "rw",
      item.type === "product" ? db.products : item.type === "expense" ? db.expenses : db.cash,
      db.queue,
      async () => {
        await queueRemoveByTypeAndId(item.type, item.id);

        if (item.type === "product") {
          const local = item.local as LocalProduct;
          if (item.action === "delete") {
            await db.products.update(item.id, {
              syncStatus: "deleted",
              conflictAction: undefined,
              deletedAt: now,
              updatedAt: now,
            });
            await queueAdd("product", "delete", {
              id: item.id,
              updatedAt: local.updatedAt,
              force: true,
            });
          } else {
            const payload = { ...local, updatedAt: now, syncStatus: "updated" as const };
            await db.products.put({
              ...payload,
              conflictAction: undefined,
            });
            await queueAdd("product", "update", { ...payload, force: true });
          }
        }

        if (item.type === "expense") {
          const local = item.local as LocalExpense;
          if (item.action === "delete") {
            await db.expenses.update(item.id, {
              syncStatus: "deleted",
              conflictAction: undefined,
              deletedAt: now,
              updatedAt: now,
            });
            await queueAdd("expense", "delete", {
              id: item.id,
              shopId: local.shopId,
              updatedAt: local.updatedAt,
              force: true,
            });
          } else {
            const payload = { ...local, updatedAt: now, syncStatus: "updated" as const };
            await db.expenses.put({
              ...(payload as any),
              conflictAction: undefined,
            });
            await queueAdd("expense", "update", { ...payload, force: true });
          }
        }

        if (item.type === "cash") {
          const local = item.local as LocalCashEntry;
          if (item.action === "delete") {
            await db.cash.update(item.id, {
              syncStatus: "deleted",
              conflictAction: undefined,
              deletedAt: now,
              updatedAt: now,
            });
            await queueAdd("cash", "delete", {
              id: item.id,
              updatedAt: local.updatedAt,
              force: true,
            });
          } else {
            const payload = { ...local, updatedAt: now, syncStatus: "updated" as const };
            await db.cash.put({
              ...(payload as any),
              conflictAction: undefined,
            });
            await queueAdd("cash", "update", { ...payload, force: true });
          }
        }
      }
    );
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4">
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-foreground">
            Offline Conflict Center
          </h1>
          <p className="text-sm text-muted-foreground">
            Resolve conflicts to keep your offline data consistent.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>Products: {grouped.product.length}</span>
          <span>Expenses: {grouped.expense.length}</span>
          <span>Cash: {grouped.cash.length}</span>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard"
            className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-muted px-3 text-xs font-semibold text-foreground hover:bg-muted/80"
          >
            Back to dashboard
          </Link>
        </div>
      </div>

      {state.loading ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Loading conflicts...
        </div>
      ) : state.items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No conflicts found. You are good to sync.
        </div>
      ) : (
        <div className="space-y-3">
          {state.items.map((item) => (
            <div
              key={`${item.type}:${item.id}`}
              className="rounded-2xl border border-warning/30 bg-warning-soft/50 p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {item.title}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.subtitle}
                  </div>
                  <div className="mt-1 text-[11px] text-warning">
                    Conflict on {item.type} ({item.action})
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!online}
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted/80 disabled:opacity-60"
                    onClick={() => resolveUseServer(item)}
                  >
                    Use server
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-warning/40 bg-warning/10 px-3 text-xs font-semibold text-warning hover:bg-warning/20"
                    onClick={() => resolveKeepLocal(item)}
                  >
                    {item.action === "delete" ? "Delete anyway" : "Keep local"}
                  </button>
                </div>
              </div>
              {!online ? (
                <p className="mt-2 text-xs text-warning/80">
                  Connect to the internet to fetch server data.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
