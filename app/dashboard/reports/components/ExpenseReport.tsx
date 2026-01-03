// app/dashboard/reports/components/ExpenseReport.tsx

"use client";

import { useCallback, useEffect, useState } from "react";

type Props = { shopId: string; from?: string; to?: string };

export default function ExpenseReport({ shopId, from, to }: Props) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (rangeFrom?: string, rangeTo?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ shopId });
      if (rangeFrom) params.append("from", rangeFrom);
      if (rangeTo) params.append("to", rangeTo);

      const res = await fetch(`/api/reports/expenses?${params.toString()}`);
      if (!res.ok) {
        setItems([]);
        return;
      }
      const data = await res.json();
      setItems(data.rows || []);
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    void load(from, to);
  }, [load, from, to]);

  const total = items.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">খরচ রিপোর্ট</h2>
          <p className="text-xs text-muted-foreground">বিভাগ, তারিখ, নোট</p>
        </div>
      </div>

      <p className="text-sm font-semibold text-foreground">
        মোট খরচ: {total.toFixed(2)} ৳
      </p>

      <div className="border border-border rounded-lg bg-card p-4 space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">লোড হচ্ছে...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            কোনো খরচ পাওয়া যায়নি
          </p>
        ) : (
          items.map((e) => (
            <div
              key={e.id}
              className="border border-border bg-card p-3 rounded-lg flex justify-between items-center hover:bg-muted transition-colors"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {Number(e.amount).toFixed(2)} ৳
                </p>
                <p className="text-xs text-muted-foreground">{e.category}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {new Date(e.expenseDate).toLocaleDateString("bn-BD")}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
