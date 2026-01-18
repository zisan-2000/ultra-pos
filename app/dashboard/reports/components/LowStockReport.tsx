// app/dashboard/reports/components/LowStockReport.tsx

"use client";

import { useCallback, useEffect, useState } from "react";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { REPORT_ROW_LIMIT } from "@/lib/reporting-config";
import { getStockToneClasses } from "@/lib/stock-level";
import { handlePermissionError } from "@/lib/permission-toast";

export default function LowStockReport({ shopId }: { shopId: string }) {
  const online = useOnlineStatus();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const buildCacheKey = useCallback(
    () => `reports:low-stock:${shopId}:${REPORT_ROW_LIMIT}`,
    [shopId]
  );

  const loadCached = useCallback(
    () => {
      try {
        const raw = localStorage.getItem(buildCacheKey());
        if (!raw) {
          return false;
        }
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setItems(parsed);
          return true;
        }
      } catch (err) {
        handlePermissionError(err);
        console.warn("Low stock cache read failed", err);
      }
      return false;
    },
    [buildCacheKey]
  );

  const load = useCallback(
    async () => {
      try {
        if (!online) {
          setLoading(false);
          loadCached();
          return;
        }
        setLoading(true);
        const res = await fetch(
          `/api/reports/low-stock?shopId=${shopId}&limit=${REPORT_ROW_LIMIT}`
        );
        const json = await res.json();
        const rows = json.data || [];
        setItems(rows);
        try {
          localStorage.setItem(buildCacheKey(), JSON.stringify(rows));
        } catch (err) {
          handlePermissionError(err);
          console.warn("Low stock cache write failed", err);
        }
      } finally {
        setLoading(false);
      }
    },
    [online, shopId, buildCacheKey, loadCached]
  );

  useEffect(() => {
    load();
  }, [load]);

  const renderStatus = (qty: number) => (qty <= 5 ? "জরুরি" : "কম");

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-foreground">স্টক কম</h2>
          <p className="text-xs text-muted-foreground">থ্রেশহোল্ডের নিচের পণ্যগুলো</p>
        </div>

        <span className="text-xs text-muted-foreground">Limit {REPORT_ROW_LIMIT}</span>
      </div>

      <div className="border border-border rounded-lg overflow-x-auto hidden md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3 text-left text-foreground">পণ্য</th>
              <th className="p-3 text-right text-foreground">মজুত সংখ্যা</th>
              <th className="p-3 text-right text-foreground">অবস্থা</th>
            </tr>
          </thead>

          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="p-3 text-center text-muted-foreground" colSpan={3}>
                  {loading ? "লোড হচ্ছে..." : "কোনো পণ্য মজুত শূন্য নয়"}
                </td>
              </tr>
            ) : (
              items.map((p, i) => (
                <tr
                  key={i}
                  className="border-t hover:bg-muted transition-colors"
                >
                  {(() => {
                    const qty = Number(p.stockQty || 0);
                    const stockClasses = getStockToneClasses(qty);
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-soft/50 via-card to-card" />
        <div className="relative space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-warning/15 text-warning text-lg">
                ⚠️
              </span>
              <div>
                <h2 className="text-lg font-bold text-foreground">স্টক কম</h2>
                <p className="text-xs text-muted-foreground">
                  থ্রেশহোল্ডের নিচের পণ্যগুলো
                </p>
              </div>
            </div>
            <span className="inline-flex h-7 items-center rounded-full border border-border bg-card/80 px-3 text-xs font-semibold text-muted-foreground">
              Limit {REPORT_ROW_LIMIT}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border overflow-x-auto hidden md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3 text-left text-foreground">পণ্য</th>
              <th className="p-3 text-right text-foreground">মজুত সংখ্যা</th>
              <th className="p-3 text-right text-foreground">অবস্থা</th>
            </tr>
          </thead>

          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="p-3 text-center text-muted-foreground" colSpan={3}>
                  {loading ? "লোড হচ্ছে..." : "কোনো পণ্য মজুত শূন্য নয়"}
                </td>
              </tr>
            ) : (
              items.map((p, i) => (
                <tr
                  key={i}
                  className="border-t hover:bg-muted transition-colors"
                >
                  {(() => {
                    const qty = Number(p.stockQty || 0);
                    const stockClasses = getStockToneClasses(qty);
                    return (
                      <>
                        <td className="p-3 text-foreground">{p.name}</td>
                        <td className="p-3 text-right text-foreground">{p.stockQty}</td>
                        <td
                          className={`p-3 text-right font-semibold ${stockClasses.text}`}
                        >
                          {renderStatus(qty)}
                        </td>
                      </>
                    );
                  })()}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {items.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            {loading ? "লোড হচ্ছে..." : "কোনো পণ্য মজুত শূন্য নয়"}
          </p>
        ) : (
          items.map((p, i) => {
            const qty = Number(p.stockQty || 0);
            const stockClasses = getStockToneClasses(qty);
            return (
              <div
                key={i}
                className="relative overflow-hidden bg-card border border-border/70 rounded-2xl p-4 shadow-[0_10px_20px_rgba(15,23,42,0.06)]"
              >
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-warning-soft/35 via-transparent to-transparent" />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-warning/15 text-warning text-lg">
                      ⚠️
                    </span>
                    <div>
                      <p className="text-xs text-muted-foreground">#{i + 1}</p>
                      <h3 className="text-base font-semibold text-foreground mt-1">
                        {p.name}
                      </h3>
                    </div>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${stockClasses.pill}`}
                  >
                    {renderStatus(qty)}
                  </span>
                </div>
                <div className="relative mt-3 flex items-center justify-between text-sm text-muted-foreground">
                  <span>মজুত সংখ্যা</span>
                  <span className="font-semibold text-foreground">{qty}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
                  })()}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {items.length === 0 ? (
          <p className="text-center text-muted-foreground bg-card border border-border rounded-lg p-4">
            {loading ? "লোড হচ্ছে..." : "কোনো পণ্য মজুত শূন্য নয়"}
          </p>
        ) : (
          items.map((p, i) => {
            const qty = Number(p.stockQty || 0);
            const stockClasses = getStockToneClasses(qty);
            return (
              <div
                key={i}
                className="bg-card border border-border rounded-xl p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">#{i + 1}</p>
                    <h3 className="text-base font-semibold text-foreground mt-1">
                      {p.name}
                    </h3>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${stockClasses.pill}`}
                  >
                    {renderStatus(qty)}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                  <span>মজুত সংখ্যা</span>
                  <span className="font-semibold text-foreground">{qty}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
