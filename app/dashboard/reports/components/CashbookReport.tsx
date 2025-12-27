// app/dashboard/reports/components/CashbookReport.tsx

"use client";

import { useEffect, useMemo, useState } from "react";

type Props = { shopId: string; from?: string; to?: string };

type CashRow = {
  id: string;
  entryType: string;
  amount: number;
  reason: string;
  createdAt: string;
};

export default function CashbookReport({ shopId, from, to }: Props) {
  const [rows, setRows] = useState<CashRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load(rangeFrom?: string, rangeTo?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ shopId });
      if (rangeFrom) params.append("from", rangeFrom);
      if (rangeTo) params.append("to", rangeTo);

      const res = await fetch(`/api/reports/cash?${params.toString()}`);
      if (!res.ok) {
        setRows([]);
        return;
      }
      const data = await res.json();
      setRows(data.rows || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(from, to);
  }, [shopId, from, to]);

  const totals = useMemo(() => {
    const inbound = rows
      .filter((r) => (r.entryType || "").toUpperCase() === "IN")
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const outbound = rows
      .filter((r) => (r.entryType || "").toUpperCase() === "OUT")
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);
    return { inbound, outbound, balance: inbound - outbound };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">ক্যাশ রিপোর্ট</h2>
          <p className="text-xs text-gray-500">ক্যাশ ইন/আউট</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-100 px-3 py-2">
          ইন: {totals.inbound.toFixed(2)} ৳
        </div>
        <div className="rounded-lg bg-red-50 text-red-700 border border-red-100 px-3 py-2 text-right">
          আউট: {totals.outbound.toFixed(2)} ৳
        </div>
        <div className="rounded-lg bg-slate-50 text-slate-800 border border-slate-200 px-3 py-2 text-right">
          ব্যালান্স: {totals.balance.toFixed(2)} ৳
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg p-4 space-y-2">
        {loading ? (
          <p className="text-sm text-gray-500 text-center py-4">লোড হচ্ছে...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            কোনো এন্ট্রি নেই
          </p>
        ) : (
          rows.map((r) => {
            const isIn = (r.entryType || "").toUpperCase() === "IN";
            return (
              <div
                key={r.id}
                className="border border-gray-200 p-3 rounded-lg flex justify-between items-center hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p
                    className={`text-sm font-semibold ${
                      isIn ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {isIn ? "+" : "-"} {Number(r.amount || 0).toFixed(2)} ৳
                  </p>
                  <p className="text-xs text-gray-500">{r.reason || "অন্যান্য"}</p>
                </div>
                <p className="text-xs text-gray-500">
                  {new Date(r.createdAt).toLocaleDateString("bn-BD")}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
