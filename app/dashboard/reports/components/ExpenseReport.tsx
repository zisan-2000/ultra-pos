"use client";

import { useState } from "react";
import { DateRangePicker } from "./DateRangePicker";
import BarChart from "../charts/BarChart";
import { QuickDateFilter } from "./QuickDateFilter";
import { generateCSV } from "@/lib/utils/csv";
import { downloadFile } from "@/lib/utils/download";

export default function ExpenseReport({ shopId }: { shopId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);

  async function load(from: string, to: string) {
    const res = await fetch(
      `/api/reports/expenses?shopId=${shopId}&from=${from}&to=${to}`
    );

    const data = await res.json();
    const rows = data.rows || [];

    setItems(rows);

    // Group expenses by category
    const grouped: Record<string, number> = {};

    rows.forEach((e: any) => {
      if (!grouped[e.category]) grouped[e.category] = 0;
      grouped[e.category] += Number(e.amount);
    });

    const mapped = Object.entries(grouped).map(([name, value]) => ({
      name,
      value,
    }));

    setChartData(mapped);
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Expense Report</h2>

      <DateRangePicker onChange={load} />
      <QuickDateFilter onSelect={load} />

      {/* CSV Export */}
      <button
        onClick={() => {
          const csv = generateCSV(
            ["id", "amount", "category", "expenseDate", "note"],
            items // ✅ FIXED
          );
          downloadFile("expenses-report.csv", csv);
        }}
        className="px-3 py-1 border rounded text-sm"
      >
        Export CSV
      </button>

      {chartData.length > 0 && <BarChart data={chartData} />}

      {/* List */}
      <div className="border rounded p-3 mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-gray-500">No expenses found</p>
        ) : (
          items.map((e) => (
            <div
              key={e.id}
              className="border p-2 rounded flex justify-between items-center"
            >
              <div>
                <p className="font-semibold">{e.amount} ৳</p>
                <p className="text-sm text-gray-700">{e.category}</p>
              </div>

              <p className="text-xs text-gray-500">{e.expenseDate}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
