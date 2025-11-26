"use client";

import { useEffect, useState } from "react";
import { QuickDateFilter } from "./QuickDateFilter";
import { generateCSV } from "@/lib/utils/csv";
import { downloadFile } from "@/lib/utils/download";

export default function SalesReport({ shopId }: { shopId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function load(from?: string, to?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ shopId });
      if (from) params.append("from", from);
      if (to) params.append("to", to);

      const res = await fetch(`/api/reports/sales?${params.toString()}`);
      if (!res.ok) {
        setItems([]);
        return;
      }
      const data = await res.json();
      const rows = data.rows || [];

      setItems(rows);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(); // load all time by default
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  const totalAmount = items.reduce(
    (sum, s) => sum + Number(s.totalAmount || 0),
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Sales Report</h2>
          <p className="text-xs text-gray-500">List only. No charts, no fluff.</p>
        </div>
        <QuickDateFilter onSelect={load} />
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <p className="text-sm font-semibold">
          Total: {totalAmount.toFixed(2)} ?
        </p>
        <button
          onClick={() => {
            const csv = generateCSV(
              ["id", "saleDate", "totalAmount", "paymentMethod", "note"],
              items // ? FIXED
            );
            downloadFile("sales-report.csv", csv);
          }}
          className="px-3 py-1 border rounded text-sm"
        >
          Export CSV
        </button>
      </div>

      {/* List */}
      <div className="border rounded p-3 space-y-2">
        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-500">No sales found</p>
        ) : (
          items.map((s) => (
            <div key={s.id} className="border p-2 rounded flex justify-between">
              <p>
                <b>{s.totalAmount} ?</b> - {s.paymentMethod}
              </p>
              <p className="text-xs text-gray-500">
                {new Date(s.saleDate).toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
