"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { db } from "@/lib/dexie/db";
import { ExpensesDeleteButton } from "./ExpensesDeleteButton";

type Expense = {
  id: string;
  amount: string | number;
  category: string;
  note?: string | null;
  expenseDate?: string | Date | null;
};

type Props = {
  shopId: string;
  expenses: Expense[];
};

export function ExpensesListClient({ shopId, expenses }: Props) {
  const online = useOnlineStatus();
  const [items, setItems] = useState<Expense[]>(expenses);

  useEffect(() => {
    if (online) {
      setItems(expenses);
      const rows = expenses.map((e) => ({
        id: e.id,
        shopId,
        amount: (e.amount as any)?.toString?.() ?? e.amount?.toString?.() ?? "0",
        category: e.category || "Uncategorized",
        note: e.note || "",
        expenseDate: e.expenseDate
          ? new Date(e.expenseDate as any).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
        createdAt: Date.now(),
        syncStatus: "synced" as const,
      }));
      db.expenses.bulkPut(rows).catch((err) => console.error("Seed Dexie expenses failed", err));
      try {
        localStorage.setItem(`cachedExpenses:${shopId}`, JSON.stringify(expenses));
      } catch {
        // ignore
      }
      return;
    }

    db.expenses
      .where("shopId")
      .equals(shopId)
      .toArray()
      .then((rows) => {
        if (!rows || rows.length === 0) {
          try {
            const cached = localStorage.getItem(`cachedExpenses:${shopId}`);
            if (cached) setItems(JSON.parse(cached) as Expense[]);
          } catch {
            // ignore
          }
          return;
        }
        setItems(
          rows.map((r) => ({
            id: r.id,
            amount: r.amount,
            category: r.category,
            note: r.note,
            expenseDate: r.expenseDate,
          }))
        );
      })
      .catch((err) => console.error("Load offline expenses failed", err));
  }, [online, expenses, shopId]);

  const rendered = useMemo(() => items, [items]);

  if (rendered.length === 0) {
    return (
      <p className="text-center text-gray-600 py-8 bg-white border border-slate-200 rounded-xl">
        {online ? "কোনো খরচ পাওয়া যায়নি" : "Offline: খরচ ক্যাশে নেই"}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {rendered.map((e) => {
        const amountNum = Number(e.amount ?? 0);
        const formattedAmount = Number.isFinite(amountNum)
          ? amountNum.toFixed(2)
          : (e.amount as any)?.toString?.() ?? "0.00";
        const expenseDateStr = e.expenseDate
          ? new Date(e.expenseDate as any).toISOString().slice(0, 10)
          : "-";

        return (
          <div
            key={e.id}
            className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-4 md:flex-row md:justify-between md:items-center shadow-sm hover:shadow-md card-lift"
          >
            <div>
              <p className="text-2xl font-bold text-gray-900">{formattedAmount} ৳</p>
              <p className="text-base text-gray-700 mt-2">{e.category}</p>
              <p className="text-sm text-gray-500 mt-1">তারিখ: {expenseDateStr}</p>
            </div>

            <div className="w-full md:w-auto grid grid-cols-2 gap-2 md:flex md:gap-2 md:items-center">
              {online ? (
                <Link
                  href={`/dashboard/expenses/${e.id}`}
                  className="w-full md:w-auto px-4 py-2 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg font-semibold hover:border-blue-300 hover:bg-blue-100 transition-colors text-center"
                >
                  দেখুন
                </Link>
              ) : (
                <span className="text-xs text-slate-400 text-center px-3">
                  Offline: এডিট সম্ভব নয়
                </span>
              )}
              <ExpensesDeleteButton id={e.id} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
