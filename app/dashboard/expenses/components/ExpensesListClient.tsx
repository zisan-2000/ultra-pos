// app/dashboard/expenses/components/ExpensesListClient.tsx

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RefreshIconButton from "@/components/ui/refresh-icon-button";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useSyncStatus } from "@/lib/sync/sync-status";
import { db } from "@/lib/dexie/db";
import { ExpensesDeleteButton } from "./ExpensesDeleteButton";
import { handlePermissionError } from "@/lib/permission-toast";
import { reportEvents, type ReportEventData } from "@/lib/events/reportEvents";
import { useSmartPolling } from "@/lib/polling/use-smart-polling";
import { usePageVisibility } from "@/lib/use-page-visibility";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";
import QuickExpenseSheet from "./QuickExpenseSheet";
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
  cols = 2,
}: {
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
  cols?: 2 | 3;
}) {
  if (preset !== "custom") return null;
  const spanClass = cols === 3 ? "col-span-3" : "col-span-2";
  return (
    <div className={`grid gap-2 ${cols === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
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
            if (!canApplyCustom || !customFrom || !customTo) return;
            applyRangeToUrl(customFrom, customTo);
          }}
          className={`${spanClass} w-full h-11 rounded-xl bg-primary-soft text-primary border border-primary/30 text-sm font-semibold hover:bg-primary/15 hover:border-primary/40 disabled:opacity-60 transition-colors`}
        >
          রেঞ্জ প্রয়োগ করুন
        </button>
      )}
      {validationMessage ? (
        <p className={`${spanClass} text-[11px] ${isRangeValid ? "text-muted-foreground" : "text-danger"}`}>
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
  return date.toLocaleTimeString("bn-BD", { hour: "2-digit", minute: "2-digit" });
}

function formatExpenseDate(input?: string | number | Date | null) {
  if (!input) return undefined;
  const date = new Date(input as any);
  if (Number.isNaN(date.getTime())) return undefined;
  return getDhakaDateString(date);
}

function formatMoney(value: number) {
  return value.toLocaleString("bn-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
  const isVisible = usePageVisibility();
  const { pendingCount, syncing, lastSyncAt } = useSyncStatus();
  const [items, setItems] = useState<Expense[]>(expenses);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [preset, setPreset] = useState<RangePreset>(resolvePreset(from, to));
  const [customFrom, setCustomFrom] = useState<string | undefined>(from || undefined);
  const [customTo, setCustomTo] = useState<string | undefined>(to || undefined);
  const serverSnapshotRef = useRef(expenses);
  const refreshInFlightRef = useRef(false);

  const customRangeValidation = useMemo(() => {
    if (preset !== "custom") return { isValid: true, message: null as string | null };
    if (!customFrom || !customTo) return { isValid: false, message: `শুরুর ও শেষের তারিখ দিন (সর্বোচ্চ ${REPORT_MAX_RANGE_DAYS} দিন)।` };
    if (customFrom > customTo) return { isValid: false, message: "শুরুর তারিখ শেষের তারিখের আগে হতে হবে।" };
    const span = getDateRangeSpanDays(customFrom, customTo);
    if (!span) return { isValid: false, message: "সঠিক তারিখ দিন (YYYY-MM-DD)।" };
    if (span > REPORT_MAX_RANGE_DAYS) return { isValid: false, message: `সর্বোচ্চ ${REPORT_MAX_RANGE_DAYS} দিনের রেঞ্জ নির্বাচন করুন।` };
    return { isValid: true, message: `রেঞ্জ: ${span} দিন (সর্বোচ্চ ${REPORT_MAX_RANGE_DAYS} দিন)।` };
  }, [preset, customFrom, customTo]);
  const canApplyCustom = customRangeValidation.isValid;

  const handleOptimisticDelete = useCallback(
    (id: string) => {
      setItems((prev) => {
        const next = prev.filter((item) => item.id !== id);
        try { safeLocalStorageSet(`cachedExpenses:${shopId}`, JSON.stringify(next)); } catch { /* ignore */ }
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

  const { triggerRefresh } = useSmartPolling({
    profile: "expenses",
    enabled: Boolean(shopId),
    online,
    isVisible,
    blocked: syncing || pendingCount > 0,
    syncToken: lastSyncAt,
    canRefresh: () => !refreshInFlightRef.current,
    markRefreshStarted: () => { refreshInFlightRef.current = true; },
    onRefresh: () => { router.refresh(); },
  });

  useEffect(() => {
    if (!online) return;
    const handleExpenseUpdate = (event: ReportEventData) => {
      if (event.shopId !== shopId) return;
      triggerRefresh("event", { at: event.timestamp ?? Date.now() });
    };
    const listenerId = reportEvents.addListener("expense-update", handleExpenseUpdate, { shopId, priority: 5 });
    return () => { reportEvents.removeListener(listenerId); };
  }, [online, shopId, triggerRefresh]);

  const handleManualRefresh = useCallback(() => {
    setManualRefreshing(true);
    triggerRefresh("manual", { force: true });
    setTimeout(() => setManualRefreshing(false), 1800);
  }, [triggerRefresh]);

  const handleQuickExpenseCreated = useCallback(() => {
    setManualRefreshing(true);
    triggerRefresh("manual", { force: true });
    setTimeout(() => setManualRefreshing(false), 1200);
  }, [triggerRefresh]);

  useEffect(() => {
    let cancelled = false;
    const loadFromDexie = async () => {
      try {
        const rows = await db.expenses.where("shopId").equals(shopId).toArray();
        if (cancelled) return;
        const visible = (rows || []).filter((r) => r.syncStatus !== "deleted" && r.syncStatus !== "conflict");
        if (!visible || visible.length === 0) {
          try {
            const cached = safeLocalStorageGet(`cachedExpenses:${shopId}`);
            if (cached) setItems(JSON.parse(cached) as Expense[]);
          } catch { /* ignore */ }
          return;
        }
        setItems(visible.map((r) => ({ id: r.id, amount: r.amount, category: r.category, note: r.note, expenseDate: r.expenseDate, createdAt: r.createdAt, syncStatus: r.syncStatus })));
      } catch (err) {
        handlePermissionError(err);
        console.error("Load offline expenses failed", err);
      }
    };

    if (online) {
      if (syncing || pendingCount > 0 || refreshInFlightRef.current) {
        loadFromDexie();
        return () => { cancelled = true; };
      }
      const rows = expenses.map((e) => ({
        id: e.id, shopId,
        amount: (e.amount as any)?.toString?.() ?? e.amount?.toString?.() ?? "0",
        category: e.category || "Uncategorized",
        note: e.note || "",
        expenseDate: formatExpenseDate(e.expenseDate) ?? getDhakaDateString(),
        createdAt: (() => { const raw = (e as any).createdAt; if (!raw) return Date.now(); const ts = new Date(raw as any).getTime(); return Number.isFinite(ts) ? ts : Date.now(); })(),
        updatedAt: (() => { const raw = (e as any).updatedAt; if (!raw) return Date.now(); const ts = new Date(raw as any).getTime(); return Number.isFinite(ts) ? ts : Date.now(); })(),
        syncStatus: "synced" as const,
      }));
      db.transaction("rw", db.expenses, async () => {
        for (const row of rows) {
          const existing = await db.expenses.get(row.id);
          if (existing && existing.syncStatus !== "synced") continue;
          await db.expenses.put(row as any);
        }
      }).catch((err) => console.error("Seed Dexie expenses failed", err));
      try { safeLocalStorageSet(`cachedExpenses:${shopId}`, JSON.stringify(expenses)); } catch { /* ignore */ }
      return () => { cancelled = true; };
    }
    loadFromDexie();
    return () => { cancelled = true; };
  }, [online, expenses, shopId, pendingCount, syncing]);

  const range = useMemo(() => computeDhakaRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  const serverItems = useMemo(() => expenses.map((e) => ({ ...e, syncStatus: "synced" as const })), [expenses]);

  const applyRangeToUrl = useCallback(
    (nextFrom: string, nextTo: string) => {
      const params = new URLSearchParams({ shopId, from: nextFrom, to: nextTo });
      router.push(`/dashboard/expenses?${params.toString()}`);
    },
    [router, shopId]
  );

  const filteredItems = useMemo(() => {
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

  const count = online && typeof summaryCount === "number" ? summaryCount : filteredItems.length;
  const avgAmount = count > 0 ? totalAmount / count : 0;
  const hasItems = filteredItems.length > 0;

  const rangeLabel = useMemo(() => {
    if (online) {
      if (!from && !to) return "সব সময়";
      if (from && to && from === to) return from;
      if (from && to) return `${from} → ${to}`;
      return "কাস্টম";
    }
    if (!range.from && !range.to) return "সব সময়";
    if (range.from && range.to && range.from === range.to) return range.from;
    if (range.from && range.to) return `${range.from} → ${range.to}`;
    return "কাস্টম";
  }, [online, from, to, range.from, range.to]);

  const grouped = useMemo(() => {
    const groups: Record<string, typeof filteredItems> = {};
    filteredItems
      .slice()
      .sort((a, b) => {
        const da = formatExpenseDate(a.expenseDate) ?? "";
        const db = formatExpenseDate(b.expenseDate) ?? "";
        if (db !== da) return db > da ? 1 : -1;
        const ta = a.createdAt ? new Date(a.createdAt as any).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt as any).getTime() : 0;
        return tb - ta;
      })
      .forEach((e) => {
        const key = formatExpenseDate(e.expenseDate) ?? getDhakaDateString();
        groups[key] = groups[key] || [];
        groups[key].push(e);
      });
    return groups;
  }, [filteredItems]);

  return (
    <div className="space-y-4 pb-16">

      {/* Mobile date filter */}
      <div className="md:hidden sticky top-0 z-10">
        <div className="rounded-2xl border border-border bg-card/95 backdrop-blur shadow-sm">
          <div className="px-3 py-2 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-muted-foreground">সময়</p>
              <span className="max-w-30 truncate text-[11px] text-muted-foreground">{rangeLabel}</span>
            </div>
            <DateFilterRow online={online} preset={preset} customFrom={customFrom} customTo={customTo} setPreset={setPreset} applyRangeToUrl={applyRangeToUrl} />
            <CustomRangeInputs online={online} preset={preset} customFrom={customFrom} customTo={customTo} canApplyCustom={canApplyCustom} isRangeValid={customRangeValidation.isValid} validationMessage={customRangeValidation.message} setCustomFrom={setCustomFrom} setCustomTo={setCustomTo} applyRangeToUrl={applyRangeToUrl} cols={2} />
          </div>
        </div>
      </div>

      {/* Desktop filter */}
      <div className="hidden md:block">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">তারিখ ফিল্টার</p>
            <div className="flex items-center gap-2">
              <RefreshIconButton onClick={handleManualRefresh} loading={manualRefreshing} label="রিফ্রেশ" className="h-9 px-3" />
              {canCreateExpense ? (
                <QuickExpenseSheet shopId={shopId} onCreated={handleQuickExpenseCreated} fullFormHref={`/dashboard/expenses/new?shopId=${shopId}`} triggerLabel="+ নতুন খরচ" triggerClassName="inline-flex h-9 items-center rounded-full bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold shadow-sm hover:bg-primary/15 hover:border-primary/40" />
              ) : null}
            </div>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/80 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground">সময়</p>
              <span className="max-w-35 truncate text-xs text-muted-foreground">{rangeLabel}</span>
            </div>
            <DateFilterRow online={online} preset={preset} customFrom={customFrom} customTo={customTo} setPreset={setPreset} applyRangeToUrl={applyRangeToUrl} />
            <CustomRangeInputs online={online} preset={preset} customFrom={customFrom} customTo={customTo} canApplyCustom={canApplyCustom} isRangeValid={customRangeValidation.isValid} validationMessage={customRangeValidation.message} setCustomFrom={setCustomFrom} setCustomTo={setCustomTo} applyRangeToUrl={applyRangeToUrl} cols={3} />
          </div>
        </div>
      </div>

      {/* KPI section */}
      <div className="space-y-2.5">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border border-danger/30 bg-linear-to-br from-danger/10 via-card to-card p-4 shadow-[0_12px_28px_rgba(15,23,42,0.09)]">
          <div className="pointer-events-none absolute -top-8 right-0 h-28 w-28 rounded-full blur-3xl opacity-30 bg-danger/50" />
          <div className="relative flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground">মোট খরচ</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-danger">
                ৳ {formatMoney(totalAmount)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {count} এন্ট্রি · {rangeLabel}
              </p>
            </div>
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-danger/15 text-danger text-xl">
              ↓
            </span>
          </div>
        </div>

        {/* Sub KPIs */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-semibold text-muted-foreground">মোট এন্ট্রি</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{count} টি</p>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-semibold text-muted-foreground">গড় খরচ</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
              ৳ {formatMoney(avgAmount)}
            </p>
          </div>
        </div>
      </div>

      {/* Pagination */}
      {(prevHref || nextHref) ? (
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 shadow-sm">
          {prevHref ? (
            <Link href={prevHref} className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted transition-colors">
              ← আগের পাতা
            </Link>
          ) : <span />}
          <span className="text-xs text-muted-foreground">পাতা {page ?? 1}</span>
          {nextHref ? (
            <Link href={nextHref} className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted transition-colors">
              পরের পাতা →
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">{online ? "শেষ পাতা" : ""}</span>
          )}
        </div>
      ) : null}

      {/* Expense list */}
      {hasItems ? (
        <div className="space-y-4">
          {Object.keys(grouped)
            .sort((a, b) => (a > b ? -1 : 1))
            .map((dateKey) => {
              const friendly = new Date(dateKey).toLocaleDateString("bn-BD");
              const entries = grouped[dateKey];
              return (
                <div key={dateKey} className="space-y-2">
                  <div className="flex items-center gap-3 px-1">
                    <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground">
                      {friendly}
                    </p>
                    <div className="flex-1 h-px bg-border/60" />
                    <span className="inline-flex h-6 items-center rounded-full border border-border/70 bg-card px-2.5 text-[10px] font-semibold text-muted-foreground">
                      {entries.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {entries.map((e) => {
                      const amountNum = Number(e.amount ?? 0);
                      const amtFormatted = Number.isFinite(amountNum) ? formatMoney(amountNum) : (e.amount as any)?.toString?.() ?? "0.00";
                      const timeStr = formatTime(e.createdAt) || (typeof e.expenseDate === "string" && e.expenseDate.includes("T") ? formatTime(e.expenseDate) : "");

                      return (
                        <div
                          key={e.id}
                          className="overflow-hidden rounded-2xl border border-l-[3px] border-l-danger border-danger/15 bg-card shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
                        >
                          {/* Row 1: icon · category · amount */}
                          <div className="flex items-center gap-3 px-3.5 pt-3 pb-2.5">
                            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger/12 text-danger text-sm font-bold">
                              ↓
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-foreground">{e.category}</p>
                              {e.note ? (
                                <p className="truncate text-[11px] text-muted-foreground mt-0.5">{e.note}</p>
                              ) : null}
                            </div>
                            <p className="shrink-0 text-base font-bold tabular-nums text-danger">
                              ৳ {amtFormatted}
                            </p>
                          </div>

                          {/* Row 2: time | actions */}
                          <div className="flex items-center justify-between gap-2 border-t border-border/40 px-3.5 py-2">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex h-5 items-center rounded-full border border-danger/25 bg-danger/10 px-2 text-[10px] font-semibold text-danger">
                                খরচ
                              </span>
                              {timeStr ? (
                                <span className="text-[11px] text-muted-foreground">{timeStr}</span>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {online && canUpdateExpense ? (
                                <Link
                                  href={`/dashboard/expenses/${e.id}`}
                                  className="inline-flex h-7 items-center rounded-full border border-primary/30 bg-primary-soft px-3 text-xs font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-primary/15"
                                >
                                  এডিট
                                </Link>
                              ) : !online ? (
                                <span className="text-[11px] font-semibold text-warning">অফলাইন</span>
                              ) : null}
                              {canDeleteExpense ? (
                                <ExpensesDeleteButton
                                  id={e.id}
                                  shopId={shopId}
                                  amount={amountNum}
                                  syncStatus={e.syncStatus}
                                  onDeleted={handleOptimisticDelete}
                                  className="h-7 rounded-full px-3 text-xs"
                                />
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/60 px-6 py-10 text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-danger/15 bg-danger-soft/60 text-3xl">
            💸
          </div>
          <p className="text-base font-semibold text-foreground">কোনো খরচ নেই</p>
          <p className="mx-auto max-w-xs text-sm text-muted-foreground">
            {online ? "এই সময়কালে কোনো খরচ নেই" : "অফলাইনে আছেন, cached data নেই।"}
          </p>
          {online && canCreateExpense ? (
            <QuickExpenseSheet
              shopId={shopId}
              onCreated={handleQuickExpenseCreated}
              fullFormHref={`/dashboard/expenses/new?shopId=${shopId}`}
              triggerLabel="নতুন খরচ"
              triggerClassName="inline-flex items-center justify-center h-10 rounded-xl bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold hover:bg-primary/15 hover:border-primary/40"
            />
          ) : null}
        </div>
      )}

    </div>
  );
}
