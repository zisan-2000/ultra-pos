"use client";

import { useState } from "react";
import { DateRangePicker } from "./DateRangePicker";
import {
  LineChart as LChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { QuickDateFilter } from "./QuickDateFilter";

export default function ProfitTrendReport({ shopId }: { shopId: string }) {
  const [data, setData] = useState<any[]>([]);

  async function load(from: string, to: string) {
    const res = await fetch(
      `/api/reports/profit-trend?shopId=${shopId}&from=${from}&to=${to}`
    );
    const json = await res.json();
    setData(json.data || []);
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Profit Trend (Sales vs Expenses)</h2>

      <DateRangePicker onChange={load} />
      <QuickDateFilter onSelect={load} />

      <div className="w-full h-72 border rounded p-3">
        <ResponsiveContainer width="100%" height="100%">
          <LChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />

            <Line
              type="monotone"
              dataKey="sales"
              stroke="#2563eb"
              strokeWidth={2}
              name="Sales"
            />

            <Line
              type="monotone"
              dataKey="expense"
              stroke="#ef4444"
              strokeWidth={2}
              name="Expenses"
            />
          </LChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
