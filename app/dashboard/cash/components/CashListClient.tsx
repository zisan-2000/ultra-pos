// app/dashboard/cash/components/CashListClient.tsx

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RefreshIconButton from "@/components/ui/refresh-icon-button";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useSyncStatus } from "@/lib/sync/sync-status";
import { db } from "@/lib/dexie/db";
import { CashDeleteButton } from "./CashDeleteButton";
import { handlePermissionError } from "@/lib/permission-toast";
import { reportEvents, type ReportEventData } from "@/lib/events/reportEvents";
import { useSmartPolling } from "@/lib/polling/use-smart-polling";
import { usePageVisibility } from "@/lib/use-page-visibility";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";
import QuickCashEntrySheet from "./QuickCashEntrySheet";
import {
  computeRange as computeDhakaRange,
  getDateRangeSpanDays,
  getDhakaDateString,
} from "@/lib/reporting-range";
import { REPORT_MAX_RANGE_DAYS } from "@/lib/reporting-config";

type CashEntry = {
  id: string;
  entryType: "IN" | "OUT";
  amount: string | number;
  reason?: string | null;
  createdAt?: string | number | Date;
  updatedAt?: string | number | Date;
};

type Props = {
  shopId: string;
  shopName?: string;
  rows: CashEntry[];
  from?: string;
  to?: string;
  page?: number;
  prevHref?: string | null;
  nextHref?: string | null;
  hasMore?: boolean;
  summaryIn?: number;
  summaryOut?: number;
  summaryNet?: number;
  summaryCount?: number;
  canCreateCashEntry?: boolean;
  canUpdateCashEntry?: boolean;
  canDeleteCashEntry?: boolean;
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
  className?: string;
};

function DateFilterRow({
  online,
  preset,
  customFrom,
  customTo,
  setPreset,
  applyRangeToUrl,
  className = "",
}: DateFilterRowProps) {
  return (
    <div className={`relative ${className}`}>
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

function formatReason(reason?: string | null) {
  if (!reason) return "";
  const trimmed = reason.trim();
  const noParenId = trimmed.replace(
    /\s*\(#?[0-9a-f]{6,}(?:-[0-9a-f]{4,})*\)\s*$/i,
    ""
  );
  return noParenId.replace(
    /\s*#(?:[0-9a-f]{6,}(?:-[0-9a-f]{4,})*)\s*$/i,
    ""
  );
}

function getEntryFlowLabel(inFlow: boolean) {
  return inFlow ? "নগদ জমা" : "নগদ খরচ";
}

function formatDate(d: Date) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
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

export function CashListClient({
  shopId,
  shopName,
  rows,
  from,
  to,
  page,
  prevHref,
  nextHref,
  hasMore,
  summaryIn,
  summaryOut,
  summaryNet,
  summaryCount,
  canCreateCashEntry = false,
  canUpdateCashEntry = false,
  canDeleteCashEntry = false,
}: Props) {
  const router = useRouter();
  const online = useOnlineStatus();
  const isVisible = usePageVisibility();
  const { pendingCount, syncing, lastSyncAt } = useSyncStatus();
  const [items, setItems] = useState<CashEntry[]>(rows);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [preset, setPreset] = useState<RangePreset>(resolvePreset(from, to));
  const [customFrom, setCustomFrom] = useState<string | undefined>(from);
  const [customTo, setCustomTo] = useState<string | undefined>(to);
  const [optimisticDeletedIds, setOptimisticDeletedIds] = useState<
    Set<string>
  >(new Set());
  const serverSnapshotRef = useRef(rows);
  const refreshInFlightRef = useRef(false);

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

  const applyRangeToUrl = useCallback(
    (nextFrom: string, nextTo: string) => {
      const params = new URLSearchParams({ shopId, from: nextFrom, to: nextTo });
      router.push(`/dashboard/cash?${params.toString()}`);
    },
    [router, shopId]
  );
  const handleOptimisticDelete = useCallback(
    (id: string) => {
      if (online) {
        setOptimisticDeletedIds((prev) => {
          const next = new Set(prev);
          next.add(id);
          return next;
        });
        return;
      }
      setItems((prev) => {
        const next = prev.filter((item) => item.id !== id);
        try {
          safeLocalStorageSet(`cachedCash:${shopId}`, JSON.stringify(next));
        } catch {
          // ignore cache errors
        }
        return next;
      });
    },
    [online, shopId]
  );

  useEffect(() => {
    if (serverSnapshotRef.current !== rows) {
      serverSnapshotRef.current = rows;
      refreshInFlightRef.current = false;
    }
  }, [rows]);

  const { triggerRefresh } = useSmartPolling({
    profile: "cash",
    enabled: Boolean(shopId),
    online,
    isVisible,
    blocked: syncing || pendingCount > 0,
    syncToken: lastSyncAt,
    canRefresh: () => !refreshInFlightRef.current,
    markRefreshStarted: () => {
      refreshInFlightRef.current = true;
    },
    onRefresh: () => {
      router.refresh();
    },
  });

  useEffect(() => {
    if (!online) return;

    const handleCashUpdate = (event: ReportEventData) => {
      if (event.shopId !== shopId) return;
      if (event.metadata?.source === "ui") return;
      triggerRefresh("event", { at: event.timestamp ?? Date.now() });
    };

    const listenerId = reportEvents.addListener(
      "cash-update",
      handleCashUpdate,
      { shopId, priority: 5 }
    );

    return () => {
      reportEvents.removeListener(listenerId);
    };
  }, [online, shopId, triggerRefresh]);

  const handleManualRefresh = useCallback(() => {
    setManualRefreshing(true);
    triggerRefresh("manual", { force: true });
    setTimeout(() => setManualRefreshing(false), 1800);
  }, [triggerRefresh]);

  const handleQuickCashCreated = useCallback(() => {
    setManualRefreshing(true);
    triggerRefresh("manual", { force: true });
    setTimeout(() => setManualRefreshing(false), 1200);
  }, [triggerRefresh]);

  useEffect(() => {
    let cancelled = false;

    const loadFromDexie = async () => {
      try {
        const entries = await db.cash.where("shopId").equals(shopId).toArray();
        if (cancelled) return;
        const visible = (entries || []).filter(
          (entry) =>
            entry.syncStatus !== "deleted" && entry.syncStatus !== "conflict"
        );
        if (!visible || visible.length === 0) {
          try {
            const cached = safeLocalStorageGet(`cachedCash:${shopId}`);
            if (cached) setItems(JSON.parse(cached) as CashEntry[]);
          } catch {
            // ignore
          }
          return;
        }
        setItems(
          visible.map((e) => ({
            id: e.id,
            entryType: e.entryType,
            amount: e.amount,
            reason: e.reason,
            createdAt: e.createdAt,
          }))
        );
      } catch (err) {
        handlePermissionError(err);
        console.error("Load offline cash failed", err);
      }
    };

    if (online) {
      if (syncing || pendingCount > 0 || refreshInFlightRef.current) {
        loadFromDexie();
        return () => {
          cancelled = true;
        };
      }

      const mapped = rows.map((e) => ({
        id: e.id,
        shopId,
        entryType: e.entryType || "IN",
        amount: (e.amount as any)?.toString?.() ?? "0",
        reason: e.reason || "",
        createdAt: e.createdAt
          ? new Date(e.createdAt as any).getTime()
          : Date.now(),
        updatedAt: e.updatedAt
          ? new Date(e.updatedAt as any).getTime()
          : Date.now(),
        syncStatus: "synced" as const,
      }));
      db.transaction("rw", db.cash, async () => {
        for (const row of mapped) {
          const existing = await db.cash.get(row.id);
          if (existing && existing.syncStatus !== "synced") {
            continue;
          }
          await db.cash.put(row as any);
        }
      }).catch((err) => console.error("Seed Dexie cash failed", err));
      try {
        safeLocalStorageSet(`cachedCash:${shopId}`, JSON.stringify(rows));
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
  }, [online, rows, shopId, pendingCount, syncing]);

  const range = useMemo(
    () => computeDhakaRange(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );

  const sourceItems = useMemo(() => {
    if (!online) return items;
    if (optimisticDeletedIds.size === 0) return rows;
    return rows.filter((item) => !optimisticDeletedIds.has(item.id));
  }, [online, items, optimisticDeletedIds, rows]);

  const rendered = useMemo(() => {
    return sourceItems.filter((e) => {
      const d = e.createdAt ? new Date(e.createdAt as any) : null;
      const ds = d ? getDhakaDateString(d) : undefined;
      if (online) return true;
      if (!range.from && !range.to) return true;
      if (!ds) return false;
      if (range.from && ds < range.from) return false;
      if (range.to && ds > range.to) return false;
      return true;
    });
  }, [sourceItems, online, range.from, range.to]);

  const totals = useMemo(() => {
    if (
      online &&
      typeof summaryNet === "number" &&
      typeof summaryIn === "number" &&
      typeof summaryOut === "number"
    ) {
      return { in: summaryIn, out: summaryOut, net: summaryNet };
    }
    return rendered.reduce(
      (acc, e) => {
        const amt = Number((e.amount as any)?.toString?.() ?? e.amount ?? 0);
        if (!Number.isFinite(amt)) return acc;
        if (e.entryType === "IN") {
          acc.in += amt;
        } else {
          acc.out += amt;
        }
        acc.net = acc.in - acc.out;
        return acc;
      },
      { in: 0, out: 0, net: 0 }
    );
  }, [rendered, online, summaryIn, summaryOut, summaryNet]);
  const hasItems = rendered.length > 0;
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

  const grouped = useMemo(() => {
    const groups: Record<string, CashEntry[]> = {};
    rendered
      .slice()
      .sort((a, b) => {
        const da = a.createdAt ? new Date(a.createdAt as any).getTime() : 0;
        const db = b.createdAt ? new Date(b.createdAt as any).getTime() : 0;
        return db - da;
      })
      .forEach((e) => {
        const d = e.createdAt ? new Date(e.createdAt as any) : new Date();
        const key = getDhakaDateString(d);
        groups[key] = groups[key] || [];
        groups[key].push(e);
      });
    return groups;
  }, [rendered]);

  return (
    <div className="space-y-4 pb-16">
      {/* Sticky time filter (mobile only) */}
      <div className="md:hidden sticky top-0 z-10">
        <div className="rounded-xl border border-border bg-card/95 backdrop-blur shadow-sm">
          <div className="px-3 py-2 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-muted-foreground">সময়</p>
              <span className="text-[11px] text-muted-foreground">{rangeLabel}</span>
            </div>
            <DateFilterRow
              preset={preset}
              online={online}
              customFrom={customFrom}
              customTo={customTo}
              setPreset={setPreset}
              applyRangeToUrl={applyRangeToUrl}
            />
            {preset === "custom" && (
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
                {customRangeValidation.message ? (
                  <p
                    className={`col-span-2 text-[11px] ${
                      customRangeValidation.isValid
                        ? "text-muted-foreground"
                        : "text-danger"
                    }`}
                  >
                    {customRangeValidation.message}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Desktop filter */}
      <div className="hidden md:block">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">নেট নগদ</p>
              <p
                className={`text-2xl font-bold ${
                  totals.net >= 0 ? "text-success" : "text-danger"
                }`}
              >
                {totals.net >= 0 ? "+" : ""}
                {totals.net.toFixed(2)} ৳
              </p>
              <p className="text-xs text-muted-foreground">
                {(online && typeof summaryCount === "number")
                  ? summaryCount
                  : rendered.length} এন্ট্রি
              </p>
            </div>
            <div className="flex items-center gap-2">
              <RefreshIconButton
                onClick={handleManualRefresh}
                loading={manualRefreshing}
                label="রিফ্রেশ"
                className="h-10 px-3"
              />
              {canCreateCashEntry ? (
                <QuickCashEntrySheet
                  shopId={shopId}
                  onCreated={handleQuickCashCreated}
                  fullFormHref={`/dashboard/cash/new?shopId=${shopId}`}
                  triggerLabel="নতুন এন্ট্রি"
                  triggerClassName="inline-flex h-10 items-center rounded-full bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold shadow-sm hover:bg-primary/15 hover:border-primary/40"
                />
              ) : null}
            </div>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/80 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground">সময়</p>
              <span className="text-xs text-muted-foreground">{rangeLabel}</span>
            </div>
            <DateFilterRow
              preset={preset}
              online={online}
              customFrom={customFrom}
              customTo={customTo}
              setPreset={setPreset}
              applyRangeToUrl={applyRangeToUrl}
            />
            {preset === "custom" && (
              <div className="grid grid-cols-3 gap-2">
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
                    className="h-11 rounded-xl bg-primary-soft text-primary border border-primary/30 text-sm font-semibold hover:bg-primary/15 hover:border-primary/40 disabled:opacity-60"
                  >
                    রেঞ্জ প্রয়োগ করুন
                  </button>
                )}
                {customRangeValidation.message ? (
                  <p
                    className={`col-span-3 text-xs ${
                      customRangeValidation.isValid
                        ? "text-muted-foreground"
                        : "text-danger"
                    }`}
                  >
                    {customRangeValidation.message}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI pills */}
      {(prevHref || nextHref) ? (
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
      ) : null}

      <div className="grid grid-cols-3 gap-2.5 md:gap-3">
        <div className="rounded-2xl border border-success/30 bg-success-soft p-3.5 text-center shadow-sm">
          <p className="text-xs font-semibold text-success">মোট জমা</p>
          <p className="text-lg font-bold text-success">
            + {totals.in.toFixed(2)} ৳
          </p>
        </div>

        <div className="rounded-2xl border border-danger/30 bg-danger-soft p-3.5 text-center shadow-sm">
          <p className="text-xs font-semibold text-danger">মোট খরচ</p>
          <p className="text-lg font-bold text-danger">
            - {totals.out.toFixed(2)} ৳
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3.5 text-center shadow-sm">
          <p className="text-xs font-semibold text-muted-foreground">নেট নগদ</p>
          <p
            className={`text-lg font-bold ${
              totals.net >= 0 ? "text-success" : "text-danger"
            }`}
          >
            {totals.net >= 0 ? "+" : ""}
            {totals.net.toFixed(2)} ৳
          </p>
        </div>
      </div>

      {/* Grouped list */}
      {hasItems ? (
        <div className="space-y-4">
          {Object.keys(grouped)
            .sort((a, b) => (a > b ? -1 : 1))
            .map((dateKey) => {
              const friendly = new Date(dateKey).toLocaleDateString("bn-BD");
              const entries = grouped[dateKey];
              return (
                <div key={dateKey} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground">
                      {friendly}
                    </p>
                    <span className="inline-flex h-7 items-center rounded-full border border-border bg-card px-3 text-xs font-semibold text-muted-foreground">
                      {entries.length} এন্ট্রি
                    </span>
                  </div>
                  <div className="space-y-3">
                    {entries.map((e) => {
                      const amt = Number(e.amount ?? 0);
                      const val = Number.isFinite(amt)
                        ? amt.toFixed(2)
                        : (e.amount as any)?.toString?.() ?? "0";
                      const created = e.createdAt
                        ? new Date(e.createdAt as any)
                        : null;
                      const timeStr = created
                        ? created.toLocaleTimeString("bn-BD", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "";
                      const inFlow = e.entryType === "IN";
                      const reasonLabel = formatReason(e.reason);
                      return (
                        <div
                          key={e.id}
                          className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all card-lift"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-2">
                              <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground">
                                {getEntryFlowLabel(inFlow)}
                              </p>
                              <p
                                className={`text-2xl font-bold ${
                                  inFlow ? "text-success" : "text-danger"
                                }`}
                              >
                                {inFlow ? "+" : "-"}
                                {val} ৳
                              </p>
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span
                                  className={`inline-flex h-7 items-center rounded-full px-3 font-semibold border ${
                                    inFlow
                                      ? "bg-success-soft text-success border-success/30"
                                      : "bg-danger-soft text-danger border-danger/30"
                                  }`}
                                >
                                  {inFlow ? "জমা" : "খরচ"}
                                </span>
                                {timeStr ? (
                                  <span className="inline-flex h-7 items-center rounded-full bg-card px-3 font-semibold text-muted-foreground border border-border">
                                    🕒 {timeStr}
                                  </span>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                <span className="inline-flex items-center rounded-full border border-border bg-muted/35 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                                  বিবরণ {reasonLabel || "নোট নেই"}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 sm:hidden">
                                {online && canUpdateCashEntry ? (
                                  <Link
                                    href={`/dashboard/cash/${e.id}`}
                                    className="inline-flex h-9 items-center justify-center rounded-full bg-primary-soft text-primary text-xs font-semibold border border-primary/30 px-3 shadow-sm hover:bg-primary/15 hover:border-primary/40"
                                  >
                                    এডিট
                                  </Link>
                                ) : online ? (
                                  <span className="inline-flex h-9 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-semibold border border-border px-3">
                                    এডিট বন্ধ
                                  </span>
                                ) : (
                                  <span className="inline-flex h-9 items-center justify-center rounded-full bg-warning-soft text-warning text-xs font-semibold border border-warning/30 px-3">
                                    অফলাইন
                                  </span>
                                )}
                                {canDeleteCashEntry ? (
                                  <CashDeleteButton
                                    id={e.id}
                                    onDeleted={handleOptimisticDelete}
                                  />
                                ) : null}
                              </div>
                            </div>
                            <div className="hidden sm:flex sm:flex-col sm:items-end sm:gap-2 sm:min-w-[140px]">
                              {online && canUpdateCashEntry ? (
                                <Link
                                  href={`/dashboard/cash/${e.id}`}
                                  className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-soft text-primary text-sm font-semibold border border-primary/30 shadow-sm hover:bg-primary/15 hover:border-primary/40 px-4"
                                >
                                  এডিট
                                </Link>
                              ) : online ? (
                                <span className="inline-flex h-10 items-center justify-center rounded-xl bg-muted text-muted-foreground text-xs font-semibold border border-border px-4">
                                  এডিট বন্ধ
                                </span>
                              ) : (
                                <span className="inline-flex h-10 items-center justify-center rounded-xl bg-warning-soft text-warning text-xs font-semibold border border-warning/30 px-4">
                                  অফলাইন
                                </span>
                              )}
                              {canDeleteCashEntry ? (
                                <CashDeleteButton
                                  id={e.id}
                                  onDeleted={handleOptimisticDelete}
                                  className="h-10 rounded-xl px-4 text-sm"
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
        <div className="rounded-3xl border border-dashed border-border bg-card/70 p-8 text-center space-y-3 shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-primary/15 bg-primary-soft/60 text-4xl shadow-[0_1px_0_rgba(0,0,0,0.03)]">
            💵
          </div>
          <p className="text-lg font-semibold text-foreground">এখনো কোনো এন্ট্রি নেই</p>
          <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">
            {online ? "প্রথম নগদ এন্ট্রি যোগ করুন" : "অফলাইনে আছেন। নগদ এন্ট্রির cached data নেই।"}
          </p>
          {online && canCreateCashEntry ? (
            <QuickCashEntrySheet
              shopId={shopId}
              onCreated={handleQuickCashCreated}
              fullFormHref={`/dashboard/cash/new?shopId=${shopId}`}
              triggerLabel="নতুন এন্ট্রি"
              triggerClassName="inline-flex items-center justify-center h-10 rounded-xl bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold hover:bg-primary/15 hover:border-primary/40"
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
