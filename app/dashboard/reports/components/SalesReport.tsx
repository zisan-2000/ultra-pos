"use client";

import { useEffect, useState } from "react";
import { DateRangePicker } from "./DateRangePicker";
import LineChart from "../charts/LineChart";
import { QuickDateFilter } from "./QuickDateFilter";
import { generateCSV } from "@/lib/utils/csv";
import { downloadFile } from "@/lib/utils/download";

export default function SalesReport({ shopId }: { shopId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);

  async function load(from?: string, to?: string) {
    const params = new URLSearchParams({ shopId });
    if (from) params.append("from", from);
    if (to) params.append("to", to);

    const res = await fetch(`/api/reports/sales?${params.toString()}`);
    if (!res.ok) {
      setItems([]);
      setChartData([]);
      return;
    }
    const data = await res.json();
    const rows = data.rows || [];

    setItems(rows);

    // Chart mapping
    const mapped = rows.map((s: any) => ({
      date: new Date(s.saleDate).toLocaleDateString(),
      value: Number(s.totalAmount),
    }));

    setChartData(mapped);
  }

  useEffect(() => {
    load(); // load all time by default
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Sales Report</h2>

      <DateRangePicker onChange={load} />
      <QuickDateFilter onSelect={load} />

      {/* CSV Export */}
      <button
        onClick={() => {
          const csv = generateCSV(
            ["id", "saleDate", "totalAmount", "paymentMethod", "note"],
            items // ✅ FIXED
          );
          downloadFile("sales-report.csv", csv);
        }}
        className="px-3 py-1 border rounded text-sm"
      >
        Export CSV
      </button>

      {/* Chart */}
      <LineChart data={chartData} />

      {/* List */}
      <div className="border rounded p-3 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-gray-500">No sales found</p>
        ) : (
          items.map((s) => (
            <div key={s.id} className="border p-2 rounded flex justify-between">
              <p>
                <b>{s.totalAmount} ৳</b> — {s.paymentMethod}
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
