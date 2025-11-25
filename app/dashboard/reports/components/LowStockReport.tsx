"use client";

"use client";

import { useCallback, useEffect, useState } from "react";
import BarChart from "../charts/BarChart";

export default function LowStockReport({ shopId }: { shopId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [threshold, setThreshold] = useState(10);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (th: number) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/reports/low-stock?shopId=${shopId}&limit=${th}`
        );
        const json = await res.json();
        setItems(json.data || []);
      } finally {
        setLoading(false);
      }
    },
    [shopId]
  );

  // auto load first time and whenever threshold changes
  useEffect(() => {
    load(threshold);
  }, [load, threshold]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold">Low Stock Items</h2>

        <select
          className="border px-2 py-1"
          value={threshold}
          onChange={(e) => {
            const th = Number(e.target.value);
            setThreshold(th);
          }}
        >
          <option value={5}>Stock {"<="} 5</option>
          <option value={10}>Stock {"<="} 10</option>
          <option value={20}>Stock {"<="} 20</option>
        </select>
      </div>

      {/* Bar Chart */}
      <div className="border rounded p-3">
        {items.length === 0 ? (
          <p className="text-sm text-gray-500">
            {loading ? "Loading..." : "No low stock products"}
          </p>
        ) : (
          <BarChart
            data={items.map((p) => ({
              name: p.name,
              value: Number(p.stockQty),
            }))}
          />
        )}
      </div>

      {/* Table */}
      <div className="border rounded mt-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Product</th>
              <th className="p-2 text-right">Stock Qty</th>
              <th className="p-2 text-right">Status</th>
            </tr>
          </thead>

          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="p-2 text-center" colSpan={3}>
                  {loading ? "Loading..." : "No low stock products"}
                </td>
              </tr>
            ) : (
              items.map((p, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2">{p.name}</td>
                  <td className="p-2 text-right">{p.stockQty}</td>
                  <td
                    className={`p-2 text-right font-semibold ${
                      Number(p.stockQty) <= 5
                        ? "text-red-600"
                        : "text-orange-500"
                    }`}
                  >
                    {Number(p.stockQty) <= 5 ? "CRITICAL" : "LOW"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
