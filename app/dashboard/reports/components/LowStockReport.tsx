"use client";

import { useCallback, useEffect, useState } from "react";

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
        <div>
          <h2 className="text-lg font-bold">Low Stock Items</h2>
          <p className="text-xs text-gray-500">
            Simple list to restock fast. No graphs.
          </p>
        </div>

        <select
          className="border px-2 py-1 text-sm"
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

      <div className="border rounded">
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
