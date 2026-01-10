// app/dashboard/reports/components/LowStockReport.tsx

"use client";

import { useCallback, useEffect, useState } from "react";
import { useOnlineStatus } from "@/lib/sync/net-status";

export default function LowStockReport({ shopId }: { shopId: string }) {
  const online = useOnlineStatus();
  const [items, setItems] = useState<any[]>([]);
  const [threshold, setThreshold] = useState(10);
  const [loading, setLoading] = useState(false);

  const buildCacheKey = useCallback(
    (limit: number) => `reports:low-stock:${shopId}:${limit}`,
    [shopId]
  );

  const loadCached = useCallback(
    (limit: number) => {
      try {
        const raw = localStorage.getItem(buildCacheKey(limit));
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
        console.warn("Low stock cache read failed", err);
      }
      setItems([]);
      return false;
    },
    [buildCacheKey]
  );

  const load = useCallback(
    async (th: number) => {
      try {
        if (!online) {
          setLoading(false);
          loadCached(th);
          return;
        }
        setLoading(true);
        const res = await fetch(
          `/api/reports/low-stock?shopId=${shopId}&limit=${th}`
        );
        const json = await res.json();
        const rows = json.data || [];
        setItems(rows);
        try {
          localStorage.setItem(buildCacheKey(th), JSON.stringify(rows));
        } catch (err) {
          console.warn("Low stock cache write failed", err);
        }
      } finally {
        setLoading(false);
      }
    },
    [online, shopId, buildCacheKey, loadCached]
  );

  useEffect(() => {
    load(threshold);
  }, [load, threshold]);

  const renderStatus = (qty: number) => (qty <= 5 ? "জরুরি" : "কম");

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-foreground">স্টক কম</h2>
          <p className="text-xs text-muted-foreground">থ্রেশহোল্ডের নিচের পণ্যগুলো</p>
        </div>

        <select
          className="border border-border bg-card text-foreground px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
          value={threshold}
          onChange={(e) => {
            const th = Number(e.target.value);
            setThreshold(th);
          }}
        >
          <option value={5}>শীর্ষ ৫</option>
          <option value={10}>শীর্ষ ১০</option>
          <option value={20}>শীর্ষ ২০</option>
        </select>
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
                  <td className="p-3 text-foreground">{p.name}</td>
                  <td className="p-3 text-right text-foreground">{p.stockQty}</td>
                  <td
                    className={`p-3 text-right font-semibold ${
                      Number(p.stockQty) <= 5
                        ? "text-danger"
                        : "text-warning"
                    }`}
                  >
                    {renderStatus(Number(p.stockQty))}
                  </td>
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
            const critical = qty <= 5;
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
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      critical
                        ? "bg-danger-soft text-danger"
                        : "bg-warning-soft text-warning"
                    }`}
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
