// app/dashboard/expenses/components/ExpensesListClient.tsx

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useSyncStatus } from "@/lib/sync/sync-status";
import { db } from "@/lib/dexie/db";
import { ExpensesDeleteButton } from "./ExpensesDeleteButton";
import { handlePermissionError } from "@/lib/permission-toast";

type Expense = {
  id: string;
  amount: string | number;
  category: string;
  note?: string | null;
  expenseDate?: string | Date | null;
};

type Props = {
  shopId: string;
  expenses: Expense[];
  from?: string;
  to?: string;
  page?: number;
  prevHref?: string | null;
  nextHref?: string | null;
  hasMore?: boolean;
  summaryTotal?: string;
  summaryCount?: number;
};

type RangePreset = "today" | "yesterday" | "7d" | "month" | "all" | "custom";

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: "today", label: "আজ" },
  { key: "yesterday", label: "গতকাল" },
  { key: "7d", label: "৭ দিন" },
  { key: "month", label: "এই মাস" },
  { key: "all", label: "সব" },
  { key: "custom", label: "কাস্টম" },
];

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDate(d: Date) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function computeRange(preset: RangePreset, customFrom?: string, customTo?: string) {
  const toStr = (d: Date) => d.toISOString().split("T")[0];
  const today = new Date();
  if (preset === "custom") return { from: customFrom, to: customTo };
  if (preset === "today") return { from: toStr(today), to: toStr(today) };
  if (preset === "yesterday") {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    return { from: toStr(y), to: toStr(y) };
  }
  if (preset === "7d") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { from: toStr(start), to: toStr(today) };
  }
  if (preset === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: toStr(start), to: toStr(today) };
  }
  return { from: undefined, to: undefined };
}

function resolvePreset(from?: string, to?: string): RangePreset {
  if (!from && !to) return "all";
  if (!from || !to) return "custom";
  if (from === to) {
    const today = todayStr();
    if (from === today) return "today";
    const y = new Date();
    y.setDate(y.getDate() - 1);
    if (from === formatDate(y)) return "yesterday";
    return "custom";
  }
  const today = todayStr();
  if (to !== today) return "custom";
  const seven = new Date();
  seven.setDate(seven.getDate() - 6);
  if (from === formatDate(seven)) return "7d";
  const monthStart = new Date();
  monthStart.setDate(1);
  if (from === formatDate(monthStart)) return "month";
  return "custom";
}

export function ExpensesListClient({
  shopId,
  expenses,
  from,
  to,
  page,
  prevHref,
  nextHref,
  hasMore,
  summaryTotal,
  summaryCount,
}: Props) {
  const router = useRouter();
  const online = useOnlineStatus();
  const { pendingCount, syncing, lastSyncAt } = useSyncStatus();
  const [items, setItems] = useState<Expense[]>(expenses);
  const [preset, setPreset] = useState<RangePreset>("today");
  const [customFrom, setCustomFrom] = useState<string | undefined>(undefined);
  const [customTo, setCustomTo] = useState<string | undefined>(undefined);
  const serverSnapshotRef = useRef(expenses);
  const refreshInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const REFRESH_MIN_INTERVAL_MS = 15_000;

  const canApplyCustom = (() => {
    if (!customFrom || !customTo) return false;
    return customFrom <= customTo;
  })();
  const handleOptimisticDelete = useCallback(
    (id: string) => {
      setItems((prev) => {
        const next = prev.filter((item) => item.id !== id);
        try {
          localStorage.setItem(
            `cachedExpenses:${shopId}`,
            JSON.stringify(next)
          );
        } catch {
          // ignore cache errors
        }
        return next;
      });
    },
    [shopId]
  );

  useEffect(() => {
    if (serverSnapshotRef.current !== expenses) {
      serverSnapshotRef.current = expenses;
      refreshInFlightRef.current = false;
    }
  }, [expenses]);

  useEffect(() => {
    if (!online || !lastSyncAt || syncing || pendingCount > 0) return;
    if (refreshInFlightRef.current) return;
    const now = Date.now();
    if (now - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) return;
    lastRefreshAtRef.current = now;
    refreshInFlightRef.current = true;
    router.refresh();
  }, [online, lastSyncAt, syncing, pendingCount, router]);

  // Keep Dexie/cache synced for offline use
  useEffect(() => {
    let cancelled = false;

    const loadFromDexie = async () => {
      try {
        const rows = await db.expenses.where("shopId").equals(shopId).toArray();
        if (cancelled) return;
        if (!rows || rows.length === 0) {
          try {
            const cached = localStorage.getItem(`cachedExpenses:${shopId}`);
            if (cached) setItems(JSON.parse(cached) as Expense[]);
          } catch {
            // ignore
          }
          return;
        }
        setItems(
          rows.map((r) => ({
            id: r.id,
            amount: r.amount,
            category: r.category,
            note: r.note,
            expenseDate: r.expenseDate,
          }))
        );
      } catch (err) {
        handlePermissionError(err);
        console.error("Load offline expenses failed", err);
      }
    };

    if (online) {
      if (syncing || pendingCount > 0 || refreshInFlightRef.current) {
        loadFromDexie();
        return () => {
          cancelled = true;
        };
      }

      setItems(expenses);
      const rows = expenses.map((e) => ({
        id: e.id,
        shopId,
        amount:
          (e.amount as any)?.toString?.() ?? e.amount?.toString?.() ?? "0",
        category: e.category || "Uncategorized",
        note: e.note || "",
        expenseDate: e.expenseDate
          ? new Date(e.expenseDate as any).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
        createdAt: Date.now(),
        syncStatus: "synced" as const,
      }));
      db.expenses
        .bulkPut(rows)
        .catch((err) => console.error("Seed Dexie expenses failed", err));
      try {
        localStorage.setItem(
          `cachedExpenses:${shopId}`,
          JSON.stringify(expenses)
        );
      } catch {
        // ignore
      }
      return () => {
        cancelled = true;
      };
    }

    loadFromDexie();
    return () => {
      cancelled = true;
    };
  }, [online, expenses, shopId, pendingCount, syncing]);

  const range = useMemo(
    () => computeRange(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );

  useEffect(() => {
    if (!online) return;
    const resolvedPreset = resolvePreset(from, to);
    setPreset(resolvedPreset);
    setCustomFrom(from || undefined);
    setCustomTo(to || undefined);
  }, [online, from, to]);

  const applyRangeToUrl = useCallback(
    (nextFrom: string, nextTo: string) => {
      const params = new URLSearchParams({
        shopId,
        from: nextFrom,
        to: nextTo,
      });
      router.push(`/dashboard/expenses?${params.toString()}`);
    },
    [router, shopId]
  );

  const filteredItems = useMemo(() => {
    // Online: server already applied the range. Don't client-filter again.
    if (online) return items;
    return items.filter((e) => {
      const dateStr = e.expenseDate
        ? new Date(e.expenseDate as any).toISOString().slice(0, 10)
        : undefined;
      if (!range.from && !range.to) return true;
      if (!dateStr) return false;
      if (range.from && dateStr < range.from) return false;
      if (range.to && dateStr > range.to) return false;
      return true;
    });
  }, [items, online, range.from, range.to]);

  const totalAmount = useMemo(() => {
    if (online && summaryTotal !== undefined) {
      const num = Number(summaryTotal);
      return Number.isFinite(num) ? num : 0;
    }
    return filteredItems.reduce((sum, e) => {
      const amt = Number((e.amount as any)?.toString?.() ?? e.amount ?? 0);
      return Number.isFinite(amt) ? sum + amt : sum;
    }, 0);
  }, [filteredItems, online, summaryTotal]);
  const hasItems = filteredItems.length > 0;
  const rangeLabel = useMemo(() => {
    if (online) {
      if (!from && !to) return "সব সময়";
      if (from && to && from === to) return from;
      if (from && to) return `${from} → ${to}`;
      return "কাস্টম";
    }
    if (!range.from && !range.to) return "সব সময়";
    if (range.from && range.to && range.from === range.to) return range.from;
    if (range.from && range.to) return `${range.from} → ${range.to}`;
    return "কাস্টম";
  }, [online, from, to, range.from, range.to]);

  const DateFilterRow = ({ className = "" }: { className?: string }) => (
    <div className={`relative ${className}`}>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pr-10 py-1">
        {PRESETS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => {
              setPreset(key);
              if (online) {
                const next = computeRange(key, customFrom, customTo);
                const nextFrom = next.from ?? todayStr();
                const nextTo = next.to ?? nextFrom;
                applyRangeToUrl(nextFrom, nextTo);
              }
            }}
            className={`px-3.5 py-2 rounded-full text-sm font-semibold whitespace-nowrap border transition ${
              preset === key
                ? "bg-primary-soft text-primary border-primary/30 shadow-sm"
                : "bg-card text-foreground border-border/70 hover:border-primary/30 hover:bg-primary-soft/40"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-card to-transparent" />
    </div>
  );

  const CustomRangeInputs = () =>
    preset === "custom" ? (
      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          className="h-11 border border-border rounded-xl px-3 text-sm bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          value={customFrom ?? ""}
          onChange={(e) => setCustomFrom(e.target.value)}
        />
        <input
          type="date"
          className="h-11 border border-border rounded-xl px-3 text-sm bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          value={customTo ?? ""}
          onChange={(e) => setCustomTo(e.target.value)}
        />
        {online && (
          <button
            type="button"
            disabled={!canApplyCustom}
            onClick={() => {
              if (!canApplyCustom) return;
              const cf = customFrom;
              const ct = customTo;
              if (!cf || !ct) return;
              applyRangeToUrl(cf, ct);
            }}
            className="col-span-2 w-full h-11 rounded-xl bg-primary-soft text-primary border border-primary/30 text-sm font-semibold hover:bg-primary/15 hover:border-primary/40 disabled:opacity-60"
          >
            রেঞ্জ প্রয়োগ করুন
          </button>
        )}
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      {(prevHref || nextHref) && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
          <div className="flex items-center gap-2">
            {prevHref ? (
              <Link
                href={prevHref}
                className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted"
              >
                ⬅️ আগের
              </Link>
            ) : null}
          </div>
          <span className="text-xs text-muted-foreground">
            পৃষ্ঠা {page ?? 1}
          </span>
          {nextHref ? (
            <Link
              href={nextHref}
              className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted"
            >
              পরের ➡️
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">
              {online ? "শেষ" : ""}
            </span>
          )}
        </div>
      )}

      {/* Mobile sticky summary */}
      <div className="md:hidden sticky top-0 z-30">
        <div className="rounded-2xl border border-border bg-card/95 backdrop-blur shadow-sm">
          <div className="p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  সারাংশ
                </p>
                <p className="text-2xl font-bold text-foreground leading-tight">
                  {totalAmount.toFixed(2)} ৳
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {(online && typeof summaryCount === "number")
                    ? summaryCount
                    : filteredItems.length} খরচ
                </p>
              </div>
              <Link
                href={`/dashboard/expenses/new?shopId=${shopId}`}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold shadow-sm"
              >
                + নতুন খরচ
              </Link>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/80 p-2 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-muted-foreground">📅 সময়</p>
                <span className="text-[11px] text-muted-foreground">{rangeLabel}</span>
              </div>
              <DateFilterRow />
              <CustomRangeInputs />
            </div>
          </div>
        </div>
      </div>

      {/* Desktop filter row */}
      <div className="hidden md:block">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">মোট খরচ</p>
              <p className="text-2xl font-bold text-foreground">
                {totalAmount.toFixed(2)} ৳
              </p>
              <p className="text-xs text-muted-foreground">
                {(online && typeof summaryCount === "number")
                  ? summaryCount
                  : filteredItems.length} খরচ
              </p>
            </div>
            <Link
              href={`/dashboard/expenses/new?shopId=${shopId}`}
              className="inline-flex h-10 items-center rounded-full bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold shadow-sm hover:bg-primary/15 hover:border-primary/40"
            >
              + নতুন খরচ
            </Link>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/80 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground">📅 সময়</p>
              <span className="text-xs text-muted-foreground">{rangeLabel}</span>
            </div>
            <DateFilterRow />
            <CustomRangeInputs />
          </div>
        </div>
      </div>

      {hasItems ? (
        <div className="space-y-4">
          {filteredItems.map((e) => {
            const amountNum = Number(e.amount ?? 0);
            const formattedAmount = Number.isFinite(amountNum)
              ? amountNum.toFixed(2)
              : (e.amount as any)?.toString?.() ?? "0.00";
            const expenseDateStr = e.expenseDate
              ? new Date(e.expenseDate as any).toISOString().slice(0, 10)
              : "-";

            return (
              <div
                key={e.id}
                className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      খরচ
                    </p>
                    <p className="text-2xl font-bold text-foreground">
                      {formattedAmount} ৳
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex h-7 items-center rounded-full bg-primary-soft/70 px-3 font-semibold text-primary border border-primary/30">
                        {e.category}
                      </span>
                      <span className="inline-flex h-7 items-center rounded-full bg-card px-3 font-semibold text-muted-foreground border border-border">
                        📅 {expenseDateStr}
                      </span>
                    </div>
                    {e.note ? (
                      <p className="text-xs text-muted-foreground leading-snug">
                        নোট: {e.note}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[140px] sm:items-end">
                    {online ? (
                      <Link
                        href={`/dashboard/expenses/${e.id}`}
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-soft text-primary text-sm font-semibold border border-primary/30 shadow-sm hover:bg-primary/15 hover:border-primary/40"
                      >
                        দেখুন
                      </Link>
                    ) : (
                      <span className="inline-flex h-10 items-center justify-center rounded-xl bg-warning-soft text-warning text-xs font-semibold border border-warning/30">
                        Offline মোড
                      </span>
                    )}
                    <ExpensesDeleteButton
                      id={e.id}
                      onDeleted={handleOptimisticDelete}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-2 shadow-sm">
          <p className="text-lg font-semibold text-foreground">এখনো কোনো খরচ নেই</p>
          <p className="text-sm text-muted-foreground">প্রথম খরচ যোগ করুন</p>

          <Link
            href={`/dashboard/expenses/new?shopId=${shopId}`}
            className="inline-flex items-center justify-center h-10 rounded-xl bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold hover:bg-primary/15 hover:border-primary/40"
          >
            + নতুন খরচ
          </Link>
        </div>
      )}

    </div>
  );
}


