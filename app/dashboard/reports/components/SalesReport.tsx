// app/dashboard/reports/components/SalesReport.tsx

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateCSV } from "@/lib/utils/csv";
import { downloadFile } from "@/lib/utils/download";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { REPORT_ROW_LIMIT } from "@/lib/reporting-config";
import { PREFETCH_PRESETS, computePresetRange } from "@/lib/reporting-range";
import { scheduleIdle } from "@/lib/schedule-idle";
import { handlePermissionError } from "@/lib/permission-toast";

type Props = { shopId: string; from?: string; to?: string };

type ReportCursor = { at: string; id: string };

export default function SalesReport({ shopId, from, to }: Props) {
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
      `reports:sales:${shopId}:${rangeFrom || "all"}:${rangeTo || "all"}:${REPORT_ROW_LIMIT}`,
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
        console.warn("Sales report cache read failed", err);
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

        const res = await fetch(`/api/reports/sales?${params.toString()}`);
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
            console.warn("Sales report cache write failed", err);
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
        fetch(`/api/reports/sales?${params.toString()}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.rows) {
              try {
                localStorage.setItem(cacheKey, JSON.stringify(data.rows));
              } catch (err) {
                handlePermissionError(err);
                console.warn("Sales prefetch cache write failed", err);
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

  const shownTotal = useMemo(
    () => items.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0),
    [items]
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
    return `/dashboard/sales?${params.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">বিক্রি রিপোর্ট</h2>
          <p className="text-xs text-muted-foreground">সর্বশেষ 20টি বিক্রি</p>
        </div>
        <Link
          href={buildHref()}
          className="text-xs font-semibold text-primary hover:text-primary-hover"
        >
          পূর্ণ রিপোর্ট দেখুন
        </Link>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <p className="text-sm font-semibold text-foreground">
          এই তালিকায় মোট: {shownTotal.toFixed(2)} ?
        </p>
        <button
          onClick={() => {
            const csv = generateCSV(
              ["id", "saleDate", "totalAmount", "paymentMethod", "note"],
              items
            );
            downloadFile("sales-report.csv", csv);
          }}
          className="px-3 py-1 border border-border rounded text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          CSV (সর্বশেষ)
        </button>
      </div>

      {/* List */}
      <div className="border border-border rounded-lg bg-card p-4 space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">লোড হচ্ছে...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            কোনো বিক্রি পাওয়া যায়নি
          </p>
        ) : (
          items.map((s) => (
            <div
              key={s.id}
              className="border border-border bg-card p-3 rounded-lg flex justify-between items-center hover:bg-muted transition-colors"
            >
              <p>
                <b className="text-foreground">{s.totalAmount} ৳</b>{" "}
                <span className="text-muted-foreground">- {s.paymentMethod}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(s.saleDate).toLocaleDateString("bn-BD")}
              </p>
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
          <span className="text-xs text-muted-foreground">Page {page}</span>
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
