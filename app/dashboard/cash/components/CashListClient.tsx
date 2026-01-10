// app/dashboard/cash/components/CashListClient.tsx

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useSyncStatus } from "@/lib/sync/sync-status";
import { db } from "@/lib/dexie/db";
import { CashDeleteButton } from "./CashDeleteButton";

type CashEntry = {
  id: string;
  entryType: "IN" | "OUT";
  amount: string | number;
  reason?: string | null;
  createdAt?: string | number | Date;
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

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
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
}: Props) {
  const router = useRouter();
  const online = useOnlineStatus();
  const { pendingCount, syncing, lastSyncAt } = useSyncStatus();
  const [items, setItems] = useState<CashEntry[]>(rows);
  const [preset, setPreset] = useState<RangePreset>("today");
  const [customFrom, setCustomFrom] = useState<string | undefined>(from);
  const [customTo, setCustomTo] = useState<string | undefined>(to);
  const serverSnapshotRef = useRef(rows);
  const refreshInFlightRef = useRef(false);

  const canApplyCustom = (() => {
    if (!customFrom || !customTo) return false;
    return customFrom <= customTo;
  })();

  useEffect(() => {
    if (!online) return;
    if (from) setCustomFrom(from);
    if (to) setCustomTo(to);
  }, [online, from, to]);

  const applyRangeToUrl = useCallback(
    (nextFrom: string, nextTo: string) => {
      const params = new URLSearchParams({ shopId, from: nextFrom, to: nextTo });
      router.push(`/dashboard/cash?${params.toString()}`);
    },
    [router, shopId]
  );
  const handleOptimisticDelete = useCallback(
    (id: string) => {
      setItems((prev) => {
        const next = prev.filter((item) => item.id !== id);
        try {
          localStorage.setItem(`cachedCash:${shopId}`, JSON.stringify(next));
        } catch {
          // ignore cache errors
        }
        return next;
      });
    },
    [shopId]
  );

  useEffect(() => {
    if (serverSnapshotRef.current !== rows) {
      serverSnapshotRef.current = rows;
      refreshInFlightRef.current = false;
    }
  }, [rows]);

  useEffect(() => {
    if (!online || !lastSyncAt || syncing || pendingCount > 0) return;
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    router.refresh();
  }, [online, lastSyncAt, syncing, pendingCount, router]);

  useEffect(() => {
    let cancelled = false;

    const loadFromDexie = async () => {
      try {
        const entries = await db.cash.where("shopId").equals(shopId).toArray();
        if (cancelled) return;
        if (!entries || entries.length === 0) {
          try {
            const cached = localStorage.getItem(`cachedCash:${shopId}`);
            if (cached) setItems(JSON.parse(cached) as CashEntry[]);
          } catch {
            // ignore
          }
          return;
        }
        setItems(
          entries.map((e) => ({
            id: e.id,
            entryType: e.entryType,
            amount: e.amount,
            reason: e.reason,
            createdAt: e.createdAt,
          }))
        );
      } catch (err) {
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

      setItems(rows);
      const mapped = rows.map((e) => ({
        id: e.id,
        shopId,
        entryType: e.entryType || "IN",
        amount: (e.amount as any)?.toString?.() ?? "0",
        reason: e.reason || "",
        createdAt: e.createdAt
          ? new Date(e.createdAt as any).getTime()
          : Date.now(),
        syncStatus: "synced" as const,
      }));
      db.cash
        .bulkPut(mapped as any)
        .catch((err) => console.error("Seed Dexie cash failed", err));
      try {
        localStorage.setItem(`cachedCash:${shopId}`, JSON.stringify(rows));
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
    () => computeRange(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );

  const rendered = useMemo(() => {
    return items.filter((e) => {
      const d = e.createdAt ? new Date(e.createdAt as any) : null;
      const ds = d ? d.toISOString().slice(0, 10) : undefined;
      if (online) return true;
      if (!range.from && !range.to) return true;
      if (!ds) return false;
      if (range.from && ds < range.from) return false;
      if (range.to && ds > range.to) return false;
      return true;
    });
  }, [items, online, range.from, range.to]);

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
        const key = d.toISOString().slice(0, 10);
        groups[key] = groups[key] || [];
        groups[key].push(e);
      });
    return groups;
  }, [rendered]);

  const DateFilterRow = ({ className = "" }: { className?: string }) => (
    <div className={`relative ${className}`}>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pr-10 py-2">
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
            className={`px-3.5 py-2 rounded-full text-sm font-semibold whitespace-nowrap border ${
              preset === key
                ? "bg-primary-soft text-primary border-primary/30 shadow-sm"
                : "bg-muted text-foreground border-transparent"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-card to-transparent" />
    </div>
  );

  if (rendered.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-8 bg-card border border-border rounded-xl">
        {online
          ? "এখনো কোনো এন্ট্রি নেই।"
          : "Offline: ক্যাশ এন্ট্রি ক্যাশে নেই"}
      </p>
    );
  }

  return (
    <div className="space-y-4 pb-16">
      {/* Sticky mobile header */}
      <div className="md:hidden sticky top-0 z-30 bg-card/95 backdrop-blur border-b border-border py-2 space-y-2">
        <div className="px-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground font-semibold">
              {shopName || "দোকান"}
            </p>
            <p className="text-xl font-bold text-foreground leading-tight">
              {totals.net.toFixed(2)} ৳
            </p>
            <p className="text-[11px] text-muted-foreground">
              {(online && typeof summaryCount === "number")
                ? summaryCount
                : rendered.length} এন্ট্রি
            </p>
          </div>
          <Link
            href={`/dashboard/cash/new?shopId=${shopId}`}
            className="px-4 py-2 rounded-lg bg-primary-soft text-primary border border-primary/30 text-sm font-semibold shadow-sm hover:bg-primary/15 hover:border-primary/40"
          >
            + নতুন এন্ট্রি
          </Link>
        </div>
        <div className="px-2 space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground"> সময়</p>
          <DateFilterRow />
          {preset === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                className="border border-border rounded-lg px-3 py-2 text-sm"
                value={customFrom ?? ""}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <input
                type="date"
                className="border border-border rounded-lg px-3 py-2 text-sm"
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
                  className="col-span-2 w-full rounded-lg bg-primary-soft text-primary border border-primary/30 py-2 text-sm font-semibold hover:bg-primary/15 hover:border-primary/40 disabled:opacity-60"
                >
                  রেঞ্জ প্রয়োগ করুন
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Desktop filter */}
      <div className="hidden md:block space-y-2">
        <div className="rounded-xl bg-card border border-border shadow-sm px-4 py-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2"> সময়</p>
          <DateFilterRow />
          {preset === "custom" && (
            <div className="flex items-center gap-2 mt-2">
              <input
                type="date"
                className="border border-border rounded px-2 py-1 text-sm"
                value={customFrom ?? ""}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <input
                type="date"
                className="border border-border rounded px-2 py-1 text-sm"
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
                  className="rounded-lg bg-primary-soft text-primary border border-primary/30 py-1 text-xs font-semibold hover:bg-primary/15 hover:border-primary/40 disabled:opacity-60"
                >
                  রেঞ্জ প্রয়োগ করুন
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* KPI pills */}
      {(prevHref || nextHref) ? (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {prevHref ? (
              <Link
                href={prevHref}
                className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted"
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
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted"
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

      <div className="grid grid-cols-3 gap-2 md:gap-3">
        <div className="bg-success-soft border border-success/30 rounded-xl p-3 text-center">
          <p className="text-xs font-semibold text-success">মোট ইন</p>
          <p className="text-lg font-bold text-success">
            + {totals.in.toFixed(2)} ৳
          </p>
        </div>

        <div className="bg-danger-soft border border-danger/30 rounded-xl p-3 text-center">
          <p className="text-xs font-semibold text-danger">মোট আউট</p>
          <p className="text-lg font-bold text-danger">
            - {totals.out.toFixed(2)} ৳
          </p>
        </div>
        <div className="bg-muted border border-border rounded-xl p-3 text-center">
          <p className="text-xs font-semibold text-muted-foreground">নেট ব্যালেন্স</p>
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
      <div className="space-y-4">
        {Object.keys(grouped)
          .sort((a, b) => (a > b ? -1 : 1))
          .map((dateKey) => {
            const friendly = new Date(dateKey).toLocaleDateString("bn-BD");
            const entries = grouped[dateKey];
            return (
              <div key={dateKey} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <p className="text-sm font-semibold text-foreground">
                    {friendly}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entries.length} এন্ট্রি
                  </p>
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
                    return (
                      <div
                        key={e.id}
                        className="bg-card border border-border rounded-xl p-4 shadow-sm hover:shadow-md transition-all card-lift"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p
                              className={`text-2xl font-bold ${
                                inFlow ? "text-success" : "text-danger"
                              }`}
                            >
                              {inFlow ? "+" : "-"}
                              {val} ৳
                            </p>
                            <p className="text-sm text-muted-foreground mt-1 truncate max-w-[240px]">
                              {e.reason || "—"}
                            </p>
                            {timeStr ? (
                              <p className="text-xs text-muted-foreground mt-1">
                                {timeStr}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            {online ? (
                              <Link
                                href={`/dashboard/cash/${e.id}`}
                                className="px-3 py-1.5 bg-primary-soft border border-primary/30 text-primary rounded-full text-xs font-semibold hover:border-primary/50 hover:bg-primary-soft transition-colors"
                              >
                                এডিট
                              </Link>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">
                                Offline
                              </span>
                            )}
                            <CashDeleteButton
                              id={e.id}
                              onDeleted={handleOptimisticDelete}
                            />
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
    </div>
  );
}
