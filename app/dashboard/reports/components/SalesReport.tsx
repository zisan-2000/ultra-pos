// app/dashboard/reports/components/SalesReport.tsx

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { generateCSV } from "@/lib/utils/csv";
import { downloadFile } from "@/lib/utils/download";
import { useOnlineStatus } from "@/lib/sync/net-status";

type Props = { shopId: string; from?: string; to?: string };

export default function SalesReport({ shopId, from, to }: Props) {
  const online = useOnlineStatus();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const buildCacheKey = useCallback(
    (rangeFrom?: string, rangeTo?: string) =>
      `reports:sales:${shopId}:${rangeFrom || "all"}:${rangeTo || "all"}`,
    [shopId]
  );

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
        console.warn("Sales report cache read failed", err);
      }
      setItems([]);
      return false;
    },
    [buildCacheKey]
  );

  const load = useCallback(
    async (rangeFrom?: string, rangeTo?: string) => {
      if (!online) {
        setLoading(false);
        loadCached(rangeFrom, rangeTo);
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams({ shopId });
        if (rangeFrom) params.append("from", rangeFrom);
        if (rangeTo) params.append("to", rangeTo);

        const res = await fetch(`/api/reports/sales?${params.toString()}`);
        if (!res.ok) {
          loadCached(rangeFrom, rangeTo);
          return;
        }
        const data = await res.json();
        const rows = data.rows || [];

        setItems(rows);
        try {
          localStorage.setItem(
            buildCacheKey(rangeFrom, rangeTo),
            JSON.stringify(rows)
          );
        } catch (err) {
          console.warn("Sales report cache write failed", err);
        }
      } finally {
        setLoading(false);
      }
    },
    [online, shopId, buildCacheKey, loadCached]
  );

  useEffect(() => {
    void load(from, to);
  }, [load, from, to]);

  const totalAmount = useMemo(
    () => items.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0),
    [items]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">বিক্রি রিপোর্ট</h2>
          <p className="text-xs text-muted-foreground">তারিখ, পেমেন্ট, নোট</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <p className="text-sm font-semibold text-foreground">
          মোট: {totalAmount.toFixed(2)} ৳
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
          CSV ডাউনলোড করুন
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
    </div>
  );
}
