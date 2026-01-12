// app/dashboard/reports/components/TopProductsReport.tsx

"use client";

import { useCallback, useEffect, useState } from "react";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { REPORT_ROW_LIMIT } from "@/lib/reporting-config";
import { handlePermissionError } from "@/lib/permission-toast";

type TopProduct = { name: string; qty: number; revenue: number };

export default function TopProductsReport({ shopId }: { shopId: string }) {
  const online = useOnlineStatus();
  const [data, setData] = useState<TopProduct[]>([]);

  const buildCacheKey = useCallback(
    () => `reports:top-products:${shopId}:${REPORT_ROW_LIMIT}`,
    [shopId]
  );

  const loadCached = useCallback(
    () => {
      try {
        const raw = localStorage.getItem(buildCacheKey());
        if (!raw) {
          setData([]);
          return false;
        }
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setData(parsed);
          return true;
        }
      } catch (err) {
        handlePermissionError(err);
        console.warn("Top products cache read failed", err);
      }
      setData([]);
      return false;
    },
    [buildCacheKey]
  );

  const load = useCallback(
    async () => {
      try {
        if (!online) {
          loadCached();
          return;
        }
        const res = await fetch(
          `/api/reports/top-products?shopId=${shopId}&limit=${REPORT_ROW_LIMIT}`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          loadCached();
          return;
        }
        const text = await res.text();
        if (!text) {
          loadCached();
          return;
        }
        const json = JSON.parse(text);
        const rows = Array.isArray(json?.data) ? json.data : [];
        setData(rows);
        try {
          localStorage.setItem(buildCacheKey(), JSON.stringify(rows));
        } catch (err) {
          handlePermissionError(err);
          console.warn("Top products cache write failed", err);
        }
      } catch (e) {
        console.error("Top products load failed", e);
        loadCached();
      }
    },
    [online, shopId, buildCacheKey, loadCached]
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-foreground">
            সেরা বিক্রি হওয়া পণ্য
          </h2>
          <p className="text-xs text-muted-foreground">
            বিক্রিত সংখ্যা ও আয়ের ভিত্তিতে তালিকা
          </p>
        </div>

        <span className="text-xs text-muted-foreground">
          Top {REPORT_ROW_LIMIT}
        </span>
      </div>

      <div className="border border-border rounded-lg overflow-x-auto hidden md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3 text-left text-foreground">পণ্য</th>
              <th className="p-3 text-right text-foreground">বিক্রিত সংখ্যা</th>
              <th className="p-3 text-right text-foreground">আয় (৳)</th>
            </tr>
          </thead>

          <tbody>
            {data.length === 0 ? (
              <tr>
                <td className="p-3 text-center text-muted-foreground" colSpan={3}>
                  কোনো তথ্য পাওয়া যায়নি
                </td>
              </tr>
            ) : (
              data.map((item, idx) => (
                <tr
                  key={idx}
                  className="border-t hover:bg-muted transition-colors"
                >
                  <td className="p-3 text-foreground">{item.name}</td>
                  <td className="p-3 text-right text-foreground">{item.qty}</td>
                  <td className="p-3 text-right text-foreground">
                    {Number(item.revenue || 0).toFixed(2)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {data.length === 0 ? (
          <p className="text-center text-muted-foreground bg-card border border-border rounded-lg p-4">
            কোনো তথ্য পাওয়া যায়নি
          </p>
        ) : (
          data.map((item, idx) => (
            <div
              key={idx}
              className="bg-card border border-border rounded-xl p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">#{idx + 1}</p>
                  <h3 className="text-base font-semibold text-foreground mt-1">
                    {item.name}
                  </h3>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">বিক্রিত</p>
                  <p className="text-lg font-semibold text-foreground">
                    {item.qty}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                <span>আয়</span>
                <span className="font-semibold text-foreground">
                  {Number(item.revenue || 0).toFixed(2)} ৳
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
