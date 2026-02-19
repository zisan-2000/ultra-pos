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
import { reportEvents, type ReportEventData } from "@/lib/events/reportEvents";
import { useRealtimeStatus } from "@/lib/realtime/status";
import { usePageVisibility } from "@/lib/use-page-visibility";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";
import {
  computeRange as computeDhakaRange,
  getDateRangeSpanDays,
  getDhakaDateString,
} from "@/lib/reporting-range";
import { REPORT_MAX_RANGE_DAYS } from "@/lib/reporting-config";

type Expense = {
  id: string;
  amount: string | number;
  category: string;
  note?: string | null;
  expenseDate?: string | Date | null;
  createdAt?: string | number | Date | null;
  updatedAt?: string | number | Date | null;
  syncStatus?: "new" | "updated" | "deleted" | "synced" | "conflict";
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
  canCreateExpense?: boolean;
  canUpdateExpense?: boolean;
  canDeleteExpense?: boolean;
};

type RangePreset = "today" | "yesterday" | "7d" | "month" | "custom";

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: "today", label: "আজ" },
  { key: "yesterday", label: "গতকাল" },
  { key: "7d", label: "৭ দিন" },
  { key: "month", label: "এই মাস" },
  { key: "custom", label: "কাস্টম" },
];

type DateFilterRowProps = {
  online: boolean;
  preset: RangePreset;
  customFrom?: string;
  customTo?: string;
  setPreset: (next: RangePreset) => void;
  applyRangeToUrl: (nextFrom: string, nextTo: string) => void;
};

function DateFilterRow({
  online,
  preset,
  customFrom,
  customTo,
  setPreset,
  applyRangeToUrl,
}: DateFilterRowProps) {
  return (
    <div className="relative">
      <div className="flex gap-2 overflow-x-auto no-scrollbar pr-10 py-1">
        {PRESETS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => {
              setPreset(key);
              if (online) {
                const next = computeDhakaRange(key, customFrom, customTo);
                const nextFrom = next.from ?? getDhakaDateString();
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
}

type CustomRangeInputsProps = {
  online: boolean;
  preset: RangePreset;
  customFrom?: string;
  customTo?: string;
  canApplyCustom: boolean;
  isRangeValid: boolean;
  validationMessage?: string | null;
  setCustomFrom: (next?: string) => void;
  setCustomTo: (next?: string) => void;
  applyRangeToUrl: (nextFrom: string, nextTo: string) => void;
};

function CustomRangeInputs({
  online,
  preset,
  customFrom,
  customTo,
  canApplyCustom,
  isRangeValid,
  validationMessage,
  setCustomFrom,
  setCustomTo,
  applyRangeToUrl,
}: CustomRangeInputsProps) {
  if (preset !== "custom") return null;

  return (
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
      {validationMessage ? (
        <p
          className={`col-span-2 text-[11px] ${
            isRangeValid ? "text-muted-foreground" : "text-danger"
          }`}
        >
          {validationMessage}
        </p>
      ) : null}
    </div>
  );
}

function formatTime(input?: string | number | Date | null) {
  if (!input) return "";
  const date = new Date(input as any);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("bn-BD", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatExpenseDate(input?: string | number | Date | null) {
  if (!input) return undefined;
  const date = new Date(input as any);
  if (Number.isNaN(date.getTime())) return undefined;
  return getDhakaDateString(date);
}

function resolvePreset(from?: string, to?: string): RangePreset {
  if (!from && !to) return "today";
  if (!from || !to) return "custom";
  if (from === to) {
    const today = getDhakaDateString();
    if (from === today) return "today";
    const yesterday = computeDhakaRange("yesterday");
    if (from === yesterday.from && from === yesterday.to) return "yesterday";
    return "custom";
  }
  const seven = computeDhakaRange("7d");
  if (from === seven.from && to === seven.to) return "7d";
  const month = computeDhakaRange("month");
  if (from === month.from && to === month.to) return "month";
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
  canCreateExpense = false,
  canUpdateExpense = false,
  canDeleteExpense = false,
}: Props) {
  const router = useRouter();
  const online = useOnlineStatus();
  const realtime = useRealtimeStatus();
  const isVisible = usePageVisibility();
  const { pendingCount, syncing, lastSyncAt } = useSyncStatus();
  const [items, setItems] = useState<Expense[]>(expenses);
  const [preset, setPreset] = useState<RangePreset>(resolvePreset(from, to));
  const [customFrom, setCustomFrom] = useState<string | undefined>(
    from || undefined
  );
  const [customTo, setCustomTo] = useState<string | undefined>(to || undefined);
  const serverSnapshotRef = useRef(expenses);
  const refreshInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const REFRESH_MIN_INTERVAL_MS = 2_000;
  const lastEventAtRef = useRef(0);
  const wasVisibleRef = useRef(isVisible);
  const pollIntervalMs = realtime.connected ? 60_000 : 10_000;
  const pollingEnabled = !realtime.connected;
  const EVENT_DEBOUNCE_MS = 800;

  const customRangeValidation = useMemo(() => {
    if (preset !== "custom") {
      return { isValid: true, message: null as string | null };
    }
    if (!customFrom || !customTo) {
      return {
        isValid: false,
        message: `শুরুর ও শেষের তারিখ দিন (সর্বোচ্চ ${REPORT_MAX_RANGE_DAYS} দিন)।`,
      };
    }
    if (customFrom > customTo) {
      return {
        isValid: false,
        message: "শুরুর তারিখ শেষের তারিখের আগে হতে হবে।",
      };
    }
    const span = getDateRangeSpanDays(customFrom, customTo);
    if (!span) {
      return {
        isValid: false,
        message: "সঠিক তারিখ দিন (YYYY-MM-DD)।",
      };
    }
    if (span > REPORT_MAX_RANGE_DAYS) {
      return {
        isValid: false,
        message: `সর্বোচ্চ ${REPORT_MAX_RANGE_DAYS} দিনের রেঞ্জ নির্বাচন করুন।`,
      };
    }
    return {
      isValid: true,
      message: `রেঞ্জ: ${span} দিন (সর্বোচ্চ ${REPORT_MAX_RANGE_DAYS} দিন)।`,
    };
  }, [preset, customFrom, customTo]);
  const canApplyCustom = customRangeValidation.isValid;
  const handleOptimisticDelete = useCallback(
    (id: string) => {
      setItems((prev) => {
        const next = prev.filter((item) => item.id !== id);
        try {
          safeLocalStorageSet(`cachedExpenses:${shopId}`, JSON.stringify(next));
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

  useEffect(() => {
    if (!online) return;

    const handleExpenseUpdate = (event: ReportEventData) => {
      if (event.shopId !== shopId) return;
      if (event.metadata?.source === "ui" && realtime.connected) return;
      const now = event.timestamp ?? Date.now();
      if (now - lastEventAtRef.current < EVENT_DEBOUNCE_MS) return;
      if (refreshInFlightRef.current) return;
      if (now - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) return;
      lastEventAtRef.current = now;
      lastRefreshAtRef.current = now;
      refreshInFlightRef.current = true;
      router.refresh();
    };

    const listenerId = reportEvents.addListener(
      "expense-update",
      handleExpenseUpdate,
      { shopId, priority: 5 }
    );

    return () => {
      reportEvents.removeListener(listenerId);
    };
  }, [online, realtime.connected, router, shopId]);

  useEffect(() => {
    if (!online || !isVisible || !pollingEnabled) return;
    const intervalId = setInterval(() => {
      const now = Date.now();
      if (now - lastEventAtRef.current < pollIntervalMs / 2) return;
      if (refreshInFlightRef.current) return;
      if (syncing || pendingCount > 0) return;
      if (now - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) return;
      lastRefreshAtRef.current = now;
      refreshInFlightRef.current = true;
      router.refresh();
    }, pollIntervalMs);

    return () => clearInterval(intervalId);
  }, [
    online,
    isVisible,
    pollingEnabled,
    router,
    syncing,
    pendingCount,
    pollIntervalMs,
  ]);

  useEffect(() => {
    if (!online) return;
    if (wasVisibleRef.current === isVisible) return;
    wasVisibleRef.current = isVisible;
    if (!isVisible) return;
    const now = Date.now();
    if (refreshInFlightRef.current) return;
    if (syncing || pendingCount > 0) return;
    if (now - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) return;
    lastEventAtRef.current = now;
    lastRefreshAtRef.current = now;
    refreshInFlightRef.current = true;
    router.refresh();
  }, [online, isVisible, router, syncing, pendingCount]);

  // Keep Dexie/cache synced for offline use
  useEffect(() => {
    let cancelled = false;

    const loadFromDexie = async () => {
      try {
        const rows = await db.expenses.where("shopId").equals(shopId).toArray();
        if (cancelled) return;
        const visible = (rows || []).filter(
          (row) => row.syncStatus !== "deleted" && row.syncStatus !== "conflict"
        );
        if (!visible || visible.length === 0) {
          try {
            const cached = safeLocalStorageGet(`cachedExpenses:${shopId}`);
            if (cached) setItems(JSON.parse(cached) as Expense[]);
          } catch {
            // ignore
          }
          return;
        }
        setItems(
          visible.map((r) => ({
            id: r.id,
            amount: r.amount,
            category: r.category,
            note: r.note,
            expenseDate: r.expenseDate,
            createdAt: r.createdAt,
            syncStatus: r.syncStatus,
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
      const rows = expenses.map((e) => ({
        id: e.id,
        shopId,
        amount:
          (e.amount as any)?.toString?.() ?? e.amount?.toString?.() ?? "0",
        category: e.category || "Uncategorized",
        note: e.note || "",
        expenseDate: formatExpenseDate(e.expenseDate) ?? getDhakaDateString(),
        createdAt: (() => {
          const raw = (e as any).createdAt;
          if (!raw) return Date.now();
          const ts = new Date(raw as any).getTime();
          return Number.isFinite(ts) ? ts : Date.now();
        })(),
        updatedAt: (() => {
          const raw = (e as any).updatedAt;
          if (!raw) return Date.now();
          const ts = new Date(raw as any).getTime();
          return Number.isFinite(ts) ? ts : Date.now();
        })(),
        syncStatus: "synced" as const,
      }));
      db.transaction("rw", db.expenses, async () => {
        for (const row of rows) {
          const existing = await db.expenses.get(row.id);
          if (existing && existing.syncStatus !== "synced") {
            continue;
          }
          await db.expenses.put(row as any);
        }
      }).catch((err) => console.error("Seed Dexie expenses failed", err));
      try {
        safeLocalStorageSet(`cachedExpenses:${shopId}`, JSON.stringify(expenses));
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
    () => computeDhakaRange(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );

  const serverItems = useMemo(
    () =>
      expenses.map((e) => ({
        ...e,
        syncStatus: "synced" as const,
      })),
    [expenses]
  );

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
    if (online) return serverItems;
    return items.filter((e) => {
      const dateStr = formatExpenseDate(e.expenseDate);
      if (!range.from && !range.to) return true;
      if (!dateStr) return false;
      if (range.from && dateStr < range.from) return false;
      if (range.to && dateStr > range.to) return false;
      return true;
    });
  }, [items, online, range.from, range.to, serverItems]);

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
              {canCreateExpense ? (
                <Link
                  href={`/dashboard/expenses/new?shopId=${shopId}`}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold shadow-sm"
                >
                  + নতুন খরচ
                </Link>
              ) : null}
            </div>
            <div className="rounded-xl border border-border/70 bg-background/80 p-2 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-muted-foreground">📅 সময়</p>
                <span className="text-[11px] text-muted-foreground">{rangeLabel}</span>
              </div>
              <DateFilterRow
                online={online}
                preset={preset}
                customFrom={customFrom}
                customTo={customTo}
                setPreset={setPreset}
                applyRangeToUrl={applyRangeToUrl}
              />
              <CustomRangeInputs
                online={online}
                preset={preset}
                customFrom={customFrom}
                customTo={customTo}
                canApplyCustom={canApplyCustom}
                isRangeValid={customRangeValidation.isValid}
                validationMessage={customRangeValidation.message}
                setCustomFrom={setCustomFrom}
                setCustomTo={setCustomTo}
                applyRangeToUrl={applyRangeToUrl}
              />
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
            {canCreateExpense ? (
              <Link
                href={`/dashboard/expenses/new?shopId=${shopId}`}
                className="inline-flex h-10 items-center rounded-full bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold shadow-sm hover:bg-primary/15 hover:border-primary/40"
              >
                + নতুন খরচ
              </Link>
            ) : null}
          </div>
          <div className="rounded-xl border border-border/70 bg-background/80 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground">📅 সময়</p>
              <span className="text-xs text-muted-foreground">{rangeLabel}</span>
            </div>
            <DateFilterRow
              online={online}
              preset={preset}
              customFrom={customFrom}
              customTo={customTo}
              setPreset={setPreset}
              applyRangeToUrl={applyRangeToUrl}
            />
            <CustomRangeInputs
              online={online}
              preset={preset}
              customFrom={customFrom}
              customTo={customTo}
              canApplyCustom={canApplyCustom}
              isRangeValid={customRangeValidation.isValid}
              validationMessage={customRangeValidation.message}
              setCustomFrom={setCustomFrom}
              setCustomTo={setCustomTo}
              applyRangeToUrl={applyRangeToUrl}
            />
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
            const expenseDateStr = formatExpenseDate(e.expenseDate) ?? "-";
            const timeStr =
              formatTime(e.createdAt) ||
              (typeof e.expenseDate === "string" && e.expenseDate.includes("T")
                ? formatTime(e.expenseDate)
                : "");

            return (
              <div
                key={e.id}
                className="relative bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all"
              >
                <div className="absolute right-3 top-3 sm:hidden">
                  {timeStr ? (
                    <span className="inline-flex flex-col items-start justify-center rounded-2xl bg-card px-3 py-1 font-semibold text-muted-foreground border border-border leading-tight shadow-sm">
                      <span className="inline-flex items-center gap-1 text-[11px]">
                        🕒 {timeStr}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px]">
                        📅 {expenseDateStr}
                      </span>
                    </span>
                  ) : (
                    <span className="inline-flex h-7 items-center rounded-full bg-card px-3 font-semibold text-muted-foreground border border-border shadow-sm">
                      📅 {expenseDateStr}
                    </span>
                  )}
                </div>
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
                    </div>
                    {e.note ? (
                      <p className="text-xs text-muted-foreground leading-snug">
                        নোট: {e.note}
                      </p>
                    ) : null}
                  </div>
                  <div className="w-full sm:w-auto sm:min-w-[220px] sm:items-end">
                    <div className="hidden sm:flex justify-start sm:justify-end">
                      {timeStr ? (
                        <span className="inline-flex flex-col items-start justify-center rounded-2xl bg-card px-3 py-1 font-semibold text-muted-foreground border border-border leading-tight shadow-sm">
                          <span className="inline-flex items-center gap-1 text-[11px]">
                            🕒 {timeStr}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px]">
                            📅 {expenseDateStr}
                          </span>
                        </span>
                      ) : (
                        <span className="inline-flex h-7 items-center rounded-full bg-card px-3 font-semibold text-muted-foreground border border-border shadow-sm">
                          📅 {expenseDateStr}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 grid w-full grid-cols-2 gap-2 sm:justify-end">
                      {online && canUpdateExpense ? (
                        <Link
                          href={`/dashboard/expenses/${e.id}`}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary-soft text-primary text-sm font-semibold border border-primary/30 shadow-sm hover:bg-primary/15 hover:border-primary/40 w-full"
                        >
                          👁️ দেখুন
                        </Link>
                      ) : online ? (
                        <span className="inline-flex h-10 items-center justify-center gap-1 rounded-xl bg-muted text-muted-foreground text-xs font-semibold border border-border w-full">
                          Edit নিষ্ক্রিয়
                        </span>
                      ) : (
                        <span className="inline-flex h-10 items-center justify-center gap-1 rounded-xl bg-warning-soft text-warning text-xs font-semibold border border-warning/30 w-full">
                          📡 Offline
                        </span>
                      )}
                      {canDeleteExpense ? (
                        <ExpensesDeleteButton
                          id={e.id}
                          shopId={shopId}
                          amount={amountNum}
                          syncStatus={e.syncStatus}
                          onDeleted={handleOptimisticDelete}
                          className="h-10 rounded-xl text-sm"
                        />
                      ) : null}
                    </div>
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

          {canCreateExpense ? (
            <Link
              href={`/dashboard/expenses/new?shopId=${shopId}`}
              className="inline-flex items-center justify-center h-10 rounded-xl bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold hover:bg-primary/15 hover:border-primary/40"
            >
              + নতুন খরচ
            </Link>
          ) : null}
        </div>
      )}

    </div>
  );
}


