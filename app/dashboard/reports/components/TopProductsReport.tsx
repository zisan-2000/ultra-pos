// app/dashboard/reports/components/TopProductsReport.tsx

"use client";

import { useCallback, useEffect, useState } from "react";

type TopProduct = { name: string; qty: number; revenue: number };

export default function TopProductsReport({ shopId }: { shopId: string }) {
  const [data, setData] = useState<TopProduct[]>([]);

  const load = useCallback(
    async (limit = 10) => {
      try {
        const res = await fetch(
          `/api/reports/top-products?shopId=${shopId}&limit=${limit}`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          setData([]);
          return;
        }
        const text = await res.text();
        if (!text) {
          setData([]);
          return;
        }
        const json = JSON.parse(text);
        setData(Array.isArray(json?.data) ? json.data : []);
      } catch (e) {
        console.error("Top products load failed", e);
        setData([]);
      }
    },
    [shopId]
  );

  useEffect(() => {
    load(10);
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

        <select
          className="border border-border bg-card text-foreground px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
          defaultValue="10"
          onChange={(e) => load(Number(e.target.value))}
        >
          <option value="5">শীর্ষ ৫</option>
          <option value="10">শীর্ষ ১০</option>
          <option value="20">শীর্ষ ২০</option>
        </select>
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
