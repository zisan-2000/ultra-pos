// app/dashboard/reports/components/CashbookReport.tsx

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

  const load = useCallback(async (rangeFrom?: string, rangeTo?: string) => {
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
  }, [shopId]);

  useEffect(() => {
    void load(from, to);
  }, [load, from, to]);

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
          <h2 className="text-lg font-bold text-foreground">ক্যাশ রিপোর্ট</h2>
          <p className="text-xs text-muted-foreground">ক্যাশ ইন/আউট</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-lg bg-success-soft text-success border border-success/30 px-3 py-2">
          ইন: {totals.inbound.toFixed(2)} ৳
        </div>
        <div className="rounded-lg bg-danger-soft text-danger border border-danger/30 px-3 py-2 text-right">
          আউট: {totals.outbound.toFixed(2)} ৳
        </div>
        <div className="rounded-lg bg-muted text-foreground border border-border px-3 py-2 text-right">
          ব্যালান্স: {totals.balance.toFixed(2)} ৳
        </div>
      </div>

      <div className="border border-border rounded-lg bg-card p-4 space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">লোড হচ্ছে...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            কোনো এন্ট্রি নেই
          </p>
        ) : (
          rows.map((r) => {
            const isIn = (r.entryType || "").toUpperCase() === "IN";
            return (
              <div
                key={r.id}
                className="border border-border bg-card p-3 rounded-lg flex justify-between items-center hover:bg-muted transition-colors"
              >
                <div>
                  <p
                    className={`text-sm font-semibold ${
                      isIn ? "text-success" : "text-danger"
                    }`}
                  >
                    {isIn ? "+" : "-"} {Number(r.amount || 0).toFixed(2)} ৳
                  </p>
                  <p className="text-xs text-muted-foreground">{r.reason || "অন্যান্য"}</p>
                </div>
                <p className="text-xs text-muted-foreground">
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
