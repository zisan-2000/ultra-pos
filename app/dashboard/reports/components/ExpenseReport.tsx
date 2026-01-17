// app/dashboard/reports/components/ExpenseReport.tsx

"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { REPORT_ROW_LIMIT } from "@/lib/reporting-config";
import { PREFETCH_PRESETS, computePresetRange } from "@/lib/reporting-range";
import { scheduleIdle } from "@/lib/schedule-idle";
import { handlePermissionError } from "@/lib/permission-toast";

type Props = { shopId: string; from?: string; to?: string };

type ReportCursor = { at: string; id: string };

export default function ExpenseReport({ shopId, from, to }: Props) {
  const online = useOnlineStatus();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [cursorList, setCursorList] = useState<ReportCursor[]>([]);
  const [nextCursor, setNextCursor] = useState<ReportCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const prefetchKeyRef = useRef<string | null>(null);

  const currentCursor = page > 1 ? cursorList[page - 2] ?? null : null;

  const buildCacheKey = useCallback(
    (rangeFrom?: string, rangeTo?: string) =>
      `reports:expenses:${shopId}:${rangeFrom || "all"}:${rangeTo || "all"}:${REPORT_ROW_LIMIT}`,
    [shopId]
  );

  useEffect(() => {
    setPage(1);
    setCursorList([]);
    setNextCursor(null);
    setHasMore(false);
  }, [shopId, from, to]);

  const loadCached = useCallback(
    (rangeFrom?: string, rangeTo?: string) => {
      try {
        const raw = localStorage.getItem(buildCacheKey(rangeFrom, rangeTo));
        if (!raw) {
          setItems([]);
          return false;
        }
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setItems(parsed);
          return true;
        }
      } catch (err) {
        handlePermissionError(err);
        console.warn("Expense report cache read failed", err);
      }
      setItems([]);
      return false;
    },
    [buildCacheKey]
  );

  const load = useCallback(
    async (rangeFrom?: string, rangeTo?: string) => {
      if (page > 1 && !currentCursor) {
        setPage(1);
        return;
      }
      const cachedApplied = page === 1 ? loadCached(rangeFrom, rangeTo) : false;
      if (!online) {
        setLoading(false);
        setHasMore(false);
        setNextCursor(null);
        if (page !== 1) {
          setPage(1);
          return;
        }
        return;
      }
      setLoading(!cachedApplied || page > 1);
      try {
        const params = new URLSearchParams({ shopId });
        if (rangeFrom) params.append("from", rangeFrom);
        if (rangeTo) params.append("to", rangeTo);
        params.append("limit", `${REPORT_ROW_LIMIT}`);
        if (currentCursor) {
          params.append("cursorAt", currentCursor.at);
          params.append("cursorId", currentCursor.id);
        }

        const res = await fetch(`/api/reports/expenses?${params.toString()}`);
        if (!res.ok) {
          if (page === 1) {
            loadCached(rangeFrom, rangeTo);
          } else {
            setItems([]);
          }
          setHasMore(false);
          setNextCursor(null);
          return;
        }
        const data = await res.json();
        const rows = data.rows || [];
        setItems(rows);
        setHasMore(Boolean(data.hasMore));
        setNextCursor(data.nextCursor ?? null);
        if (data.nextCursor) {
          setCursorList((prev) => {
            const next = [...prev];
            next[page - 1] = data.nextCursor;
            return next;
          });
        }
        if (page === 1) {
          try {
            localStorage.setItem(
              buildCacheKey(rangeFrom, rangeTo),
              JSON.stringify(rows)
            );
          } catch (err) {
            handlePermissionError(err);
            console.warn("Expense report cache write failed", err);
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [online, shopId, buildCacheKey, loadCached, page, currentCursor]
  );

  useEffect(() => {
    void load(from, to);
  }, [load, from, to]);

  useEffect(() => {
    if (!online || typeof window === "undefined") return;
    if (prefetchKeyRef.current === shopId) return;
    prefetchKeyRef.current = shopId;
    const cancel = scheduleIdle(() => {
      PREFETCH_PRESETS.forEach((presetKey) => {
        const { from: rangeFrom, to: rangeTo } = computePresetRange(presetKey);
        const cacheKey = buildCacheKey(rangeFrom, rangeTo);
        if (localStorage.getItem(cacheKey)) return;
        const params = new URLSearchParams({ shopId, limit: `${REPORT_ROW_LIMIT}` });
        if (rangeFrom) params.append("from", rangeFrom);
        if (rangeTo) params.append("to", rangeTo);
        fetch(`/api/reports/expenses?${params.toString()}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.rows) {
              try {
                localStorage.setItem(cacheKey, JSON.stringify(data.rows));
              } catch (err) {
                handlePermissionError(err);
                console.warn("Expense prefetch cache write failed", err);
              }
            }
          })
          .catch(() => {
            // ignore prefetch errors
          });
      });
    });
    return () => cancel();
  }, [online, shopId, buildCacheKey]);

  const shownTotal = items.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  );

  const handlePrev = () => {
    setPage((prev) => Math.max(1, prev - 1));
  };

  const handleNext = () => {
    const cursorToUse = cursorList[page - 1] ?? nextCursor;
    if (!cursorToUse) return;
    setCursorList((prev) => {
      const next = [...prev];
      next[page - 1] = cursorToUse;
      return next;
    });
    setPage((prev) => prev + 1);
  };

  const buildHref = () => {
    const params = new URLSearchParams({ shopId });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return `/dashboard/expenses?${params.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-soft/50 via-card to-card" />
        <div className="relative space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-foreground">খরচ রিপোর্ট</h2>
              <p className="text-xs text-muted-foreground">সর্বশেষ 20টি খরচ</p>
            </div>
            <Link
              href={buildHref()}
              className="inline-flex h-7 items-center rounded-full border border-primary/20 bg-primary-soft px-3 text-xs font-semibold text-primary hover:bg-primary/20"
            >
              পূর্ণ রিপোর্ট দেখুন
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="inline-flex h-7 items-center rounded-full border border-border bg-card/80 px-3 text-muted-foreground">
              এই তালিকায় মোট খরচ: {shownTotal.toFixed(2)} ৳
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-3 shadow-sm space-y-2">
        {loading ? (
          <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            লোড হচ্ছে...
          </p>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            কোনো খরচ পাওয়া যায়নি
          </p>
        ) : (
          items.map((e) => (
            <div
              key={e.id}
              className="rounded-xl border border-border bg-card p-3 shadow-sm transition-colors hover:bg-muted/60"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {Number(e.amount).toFixed(2)} ৳
                  </p>
                  <p className="text-xs text-muted-foreground">{e.category}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(e.expenseDate).toLocaleDateString("bn-BD")}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-between gap-2 pt-2">
          <button
            type="button"
            onClick={handlePrev}
            disabled={page <= 1 || loading || !online}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
            Page {page}
          </span>
          <button
            type="button"
            onClick={handleNext}
            disabled={!hasMore || !nextCursor || loading || !online}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
