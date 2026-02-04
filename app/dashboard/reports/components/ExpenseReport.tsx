// app/dashboard/reports/components/ExpenseReport.tsx

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { REPORT_ROW_LIMIT } from "@/lib/reporting-config";
import { PREFETCH_PRESETS, computePresetRange } from "@/lib/reporting-range";
import { scheduleIdle } from "@/lib/schedule-idle";
import { handlePermissionError } from "@/lib/permission-toast";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";

type Props = { shopId: string; from?: string; to?: string };

type ReportCursor = { at: string; id: string };
type ExpenseRow = {
  id: string;
  amount: number | string;
  category?: string | null;
  expenseDate: string;
};

function scheduleStateUpdate(fn: () => void) {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(fn);
    return;
  }
  Promise.resolve().then(fn);
}

export default function ExpenseReport({ shopId, from, to }: Props) {
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [cursorList, setCursorList] = useState<ReportCursor[]>([]);
  const prefetchKeyRef = useRef<string | null>(null);

  const currentCursor = page > 1 ? cursorList[page - 2] ?? null : null;

  const buildCacheKey = useCallback(
    (rangeFrom?: string, rangeTo?: string) =>
      `reports:expenses:${shopId}:${rangeFrom || "all"}:${rangeTo || "all"}:${REPORT_ROW_LIMIT}`,
    [shopId]
  );

  useEffect(() => {
    let cancelled = false;
    scheduleStateUpdate(() => {
      if (cancelled) return;
      setPage(1);
      setCursorList([]);
    });
    return () => {
      cancelled = true;
    };
  }, [shopId, from, to]);

  const readCached = useCallback(
    (rangeFrom?: string, rangeTo?: string) => {
      if (typeof window === "undefined") return null;
      try {
        const raw = safeLocalStorageGet(buildCacheKey(rangeFrom, rangeTo));
        if (!raw) {
          return null;
        }
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
      } catch (err) {
        handlePermissionError(err);
        console.warn("Expense report cache read failed", err);
        return null;
      }
    },
    [buildCacheKey]
  );

  const fetchExpenses = useCallback(
    async (
      rangeFrom?: string,
      rangeTo?: string,
      cursor?: ReportCursor | null,
      shouldCache = false
    ) => {
      const params = new URLSearchParams({
        shopId,
        limit: `${REPORT_ROW_LIMIT}`,
      });
      if (rangeFrom) params.append("from", rangeFrom);
      if (rangeTo) params.append("to", rangeTo);
      if (cursor) {
        params.append("cursorAt", cursor.at);
        params.append("cursorId", cursor.id);
      }

      const res = await fetch(`/api/reports/expenses?${params.toString()}`);
      if (res.status === 304) {
        const cached = readCached(rangeFrom, rangeTo);
        if (cached && !cursor) {
          return { rows: cached, hasMore: false, nextCursor: null };
        }
        throw new Error("Expense report not modified");
      }
      if (!res.ok) {
        const cached = readCached(rangeFrom, rangeTo);
        if (cached && !cursor) {
          return { rows: cached, hasMore: false, nextCursor: null };
        }
        throw new Error("Expense report fetch failed");
      }
      const data = await res.json();
      const rows = data.rows || [];
      if (shouldCache && !cursor && typeof window !== "undefined") {
        try {
          safeLocalStorageSet(
            buildCacheKey(rangeFrom, rangeTo),
            JSON.stringify(rows)
          );
        } catch (err) {
          handlePermissionError(err);
          console.warn("Expense report cache write failed", err);
        }
      }
      return {
        rows,
        hasMore: Boolean(data.hasMore),
        nextCursor: data.nextCursor ?? null,
      };
    },
    [shopId, buildCacheKey, readCached]
  );

  const expenseQueryKey = useMemo(
    () => [
      "reports",
      "expenses",
      shopId,
      from ?? "all",
      to ?? "all",
      page,
      currentCursor?.at ?? "start",
      currentCursor?.id ?? "start",
    ],
    [shopId, from, to, page, currentCursor?.at, currentCursor?.id]
  );

  const expenseQuery = useQuery({
    queryKey: expenseQueryKey,
    queryFn: () => fetchExpenses(from, to, currentCursor, page === 1),
    enabled: online,
    initialData: () => {
      if (page !== 1) {
        return { rows: [], hasMore: false, nextCursor: null };
      }
      const cached = readCached(from, to);
      return cached
        ? { rows: cached, hasMore: false, nextCursor: null }
        : { rows: [], hasMore: false, nextCursor: null };
    },
    placeholderData: (prev) =>
      prev ?? { rows: [], hasMore: false, nextCursor: null },
  });

  const items: ExpenseRow[] = expenseQuery.data?.rows ?? [];
  const hasMore = expenseQuery.data?.hasMore ?? false;
  const nextCursor = expenseQuery.data?.nextCursor ?? null;
  const loading = expenseQuery.isFetching && online;
  const hasFetched = expenseQuery.isFetchedAfterMount;
  const showEmpty = items.length === 0 && (!online || hasFetched) && !loading;

  useEffect(() => {
    if (online || page <= 1) return;
    let cancelled = false;
    scheduleStateUpdate(() => {
      if (cancelled) return;
      setPage(1);
      setCursorList([]);
    });
    return () => {
      cancelled = true;
    };
  }, [online, page]);

  useEffect(() => {
    if (page <= 1 || currentCursor) return;
    let cancelled = false;
    scheduleStateUpdate(() => {
      if (cancelled) return;
      setPage(1);
    });
    return () => {
      cancelled = true;
    };
  }, [page, currentCursor]);

  useEffect(() => {
    if (!online || typeof window === "undefined") return;
    if (prefetchKeyRef.current === shopId) return;
    prefetchKeyRef.current = shopId;
    const cancel = scheduleIdle(() => {
      PREFETCH_PRESETS.forEach((presetKey) => {
        const { from: rangeFrom, to: rangeTo } = computePresetRange(presetKey);
        const queryKey = [
          "reports",
          "expenses",
          shopId,
          rangeFrom ?? "all",
          rangeTo ?? "all",
          1,
          "start",
          "start",
        ];
        if (queryClient.getQueryData(queryKey)) return;
        queryClient.prefetchQuery({
          queryKey,
          queryFn: () => fetchExpenses(rangeFrom, rangeTo, null, true),
        });
      });
    }, 50);
    return () => cancel();
  }, [online, shopId, fetchExpenses, queryClient]);

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
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-danger/15 text-danger text-lg">
                💸
              </span>
              <div>
                <h2 className="text-lg font-bold text-foreground">খরচ রিপোর্ট</h2>
                <p className="text-xs text-muted-foreground">
                  সর্বশেষ 20টি খরচ
                </p>
              </div>
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

      <div className="rounded-2xl border border-border/70 bg-card/80 p-3 shadow-[0_10px_20px_rgba(15,23,42,0.06)] space-y-2">
        {items.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            {showEmpty ? "কোনো খরচ পাওয়া যায়নি" : "লোড হচ্ছে..."}
          </p>
        ) : (
          <>
            {items.map((e) => (
              <div
                key={e.id}
                className="relative overflow-hidden rounded-2xl border border-danger/20 bg-card p-3 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
              >
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-danger-soft/40 via-transparent to-transparent" />
                <div className="relative flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-danger/15 text-danger text-lg">
                      💸
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {Number(e.amount).toFixed(2)} ৳
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {e.category}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(e.expenseDate).toLocaleDateString("bn-BD")}
                  </p>
                </div>
              </div>
            ))}
            {loading && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                আপডেট হচ্ছে...
              </p>
            )}
          </>
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
