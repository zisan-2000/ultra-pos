"use client";

import { useCallback, useEffect, useState } from "react";

type TopProduct = { name: string; qty: number; revenue: number };

export default function TopProductsReport({ shopId }: { shopId: string }) {
  const [data, setData] = useState<TopProduct[]>([]);

  const load = useCallback(
    async (limit = 10) => {
      const res = await fetch(
        `/api/reports/top-products?shopId=${shopId}&limit=${limit}`
      );
      const json = await res.json();
      setData(json.data || []);
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
          <h2 className="text-lg font-bold">Top Selling Products</h2>
          <p className="text-xs text-gray-500">
            Straightforward table. No graphs.
          </p>
        </div>

        <select
          className="border px-2 py-1 text-sm"
          defaultValue="10"
          onChange={(e) => load(Number(e.target.value))}
        >
          <option value="5">Top 5</option>
          <option value="10">Top 10</option>
          <option value="20">Top 20</option>
        </select>
      </div>

      <div className="border rounded">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Product</th>
              <th className="p-2 text-right">Quantity Sold</th>
              <th className="p-2 text-right">Revenue (?)</th>
            </tr>
          </thead>

          <tbody>
            {data.length === 0 ? (
              <tr>
                <td className="p-2 text-center" colSpan={3}>
                  No data available
                </td>
              </tr>
            ) : (
              data.map((item, idx) => (
                <tr key={idx} className="border-t">
                  <td className="p-2">{item.name}</td>
                  <td className="p-2 text-right">{item.qty}</td>
                  <td className="p-2 text-right">{item.revenue.toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
