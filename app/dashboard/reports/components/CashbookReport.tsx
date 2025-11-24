"use client";

import { useState } from "react";
import { DateRangePicker } from "./DateRangePicker";
import PieChartComponent from "../charts/PieChart";
import { QuickDateFilter } from "./QuickDateFilter";
import { generateCSV } from "@/lib/utils/csv";
import { downloadFile } from "@/lib/utils/download";

export default function CashbookReport({ shopId }: { shopId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);

  async function load(from: string, to: string) {
    const res = await fetch(
      `/api/reports/cash?shopId=${shopId}&from=${from}&to=${to}`
    );

    const data = await res.json();
    const rows = data.rows || [];

    setItems(rows);

    const totalIn = rows
      .filter((i: any) => i.entryType === "IN")
      .reduce((s, i) => s + Number(i.amount), 0);

    const totalOut = rows
      .filter((i: any) => i.entryType === "OUT")
      .reduce((s, i) => s + Number(i.amount), 0);

    setChartData([
      { name: "Cash IN", value: totalIn },
      { name: "Cash OUT", value: totalOut },
    ]);
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Cashbook Report</h2>

      <DateRangePicker onChange={load} />
      <QuickDateFilter onSelect={load} />

      {/* CSV Export */}
      <button
        onClick={() => {
          const csv = generateCSV(
            ["id", "entryType", "amount", "reason", "createdAt"],
            items // ✅ FIXED
          );
          downloadFile("cashbook-report.csv", csv);
        }}
        className="px-3 py-1 border rounded text-sm"
      >
        Export CSV
      </button>

      {chartData.length > 0 && <PieChartComponent data={chartData} />}

      <div className="border rounded p-3 mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-gray-500">No cash entries found</p>
        ) : (
          items.map((e) => (
            <div
              key={e.id}
              className="border p-2 rounded flex justify-between items-center"
            >
              <div>
                <p
                  className={`font-semibold ${
                    e.entryType === "IN" ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {e.entryType === "IN" ? "+" : "-"}
                  {e.amount} ৳
                </p>

                {e.reason && (
                  <p className="text-sm text-gray-600">{e.reason}</p>
                )}
              </div>

              <p className="text-xs text-gray-500">
                {new Date(e.createdAt).toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
