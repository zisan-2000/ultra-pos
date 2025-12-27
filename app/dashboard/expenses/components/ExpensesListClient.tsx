// app/dashboard/expenses/components/ExpensesListClient.tsx

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

type RangePreset = "today" | "yesterday" | "7d" | "month" | "all" | "custom";

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: "today", label: "আজ" },
  { key: "yesterday", label: "গতকাল" },
  { key: "7d", label: "৭ দিন" },
  { key: "month", label: "এই মাস" },
  { key: "all", label: "সব" },
  { key: "custom", label: "কাস্টম" },
];

function computeRange(preset: RangePreset, customFrom?: string, customTo?: string) {
  const toStr = (d: Date) => d.toISOString().split("T")[0];
  const today = new Date();
  if (preset === "custom") return { from: customFrom, to: customTo };
  if (preset === "today") return { from: toStr(today), to: toStr(today) };
  if (preset === "yesterday") {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    return { from: toStr(y), to: toStr(y) };
  }
  if (preset === "7d") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { from: toStr(start), to: toStr(today) };
  }
  if (preset === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: toStr(start), to: toStr(today) };
  }
  return { from: undefined, to: undefined };
}

export function ExpensesListClient({ shopId, expenses }: Props) {
  const online = useOnlineStatus();
  const [items, setItems] = useState<Expense[]>(expenses);
  const [preset, setPreset] = useState<RangePreset>("today");
  const [customFrom, setCustomFrom] = useState<string | undefined>(undefined);
  const [customTo, setCustomTo] = useState<string | undefined>(undefined);

  // Keep Dexie/cache synced for offline use
  useEffect(() => {
    if (online) {
      setItems(expenses);
      const rows = expenses.map((e) => ({
        id: e.id,
        shopId,
        amount:
          (e.amount as any)?.toString?.() ?? e.amount?.toString?.() ?? "0",
        category: e.category || "Uncategorized",
        note: e.note || "",
        expenseDate: e.expenseDate
          ? new Date(e.expenseDate as any).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
        createdAt: Date.now(),
        syncStatus: "synced" as const,
      }));
      db.expenses
        .bulkPut(rows)
        .catch((err) => console.error("Seed Dexie expenses failed", err));
      try {
        localStorage.setItem(
          `cachedExpenses:${shopId}`,
          JSON.stringify(expenses)
        );
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

  const range = useMemo(
    () => computeRange(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );

  const filteredItems = useMemo(() => {
    return items.filter((e) => {
      const dateStr = e.expenseDate
        ? new Date(e.expenseDate as any).toISOString().slice(0, 10)
        : undefined;
      if (!range.from && !range.to) return true;
      if (!dateStr) return false;
      if (range.from && dateStr < range.from) return false;
      if (range.to && dateStr > range.to) return false;
      return true;
    });
  }, [items, range.from, range.to]);

  const totalAmount = useMemo(
    () =>
      filteredItems.reduce((sum, e) => {
        const amt = Number((e.amount as any)?.toString?.() ?? e.amount ?? 0);
        return Number.isFinite(amt) ? sum + amt : sum;
      }, 0),
    [filteredItems]
  );

  const DateFilterRow = ({ className = "" }: { className?: string }) => (
    <div className={`relative ${className}`}>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pr-10 py-2">
        {PRESETS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPreset(key)}
            className={`px-3.5 py-2 rounded-full text-sm font-semibold whitespace-nowrap ${
              preset === key
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white to-transparent" />
    </div>
  );

  const CustomRangeInputs = () =>
    preset === "custom" ? (
      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          value={customFrom ?? ""}
          onChange={(e) => setCustomFrom(e.target.value)}
        />
        <input
          type="date"
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          value={customTo ?? ""}
          onChange={(e) => setCustomTo(e.target.value)}
        />
      </div>
    ) : null;

  if (filteredItems.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-center space-y-2">
        <p className="text-lg font-semibold text-gray-800">এখনো কোনো খরচ নেই</p>
        <p className="text-sm text-gray-500">প্রথম খরচ যোগ করুন</p>
        <Link
          href={`/dashboard/expenses/new?shopId=${shopId}`}
          className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
        >
          + নতুন খরচ
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mobile sticky summary */}
      <div className="md:hidden sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-100 py-2 space-y-2">
        <div className="px-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-slate-500 font-semibold">
              মোট খরচ (নির্বাচিত সময়)
            </p>
            <p className="text-xl font-bold text-slate-900 leading-tight">
              {totalAmount.toFixed(2)} ৳
            </p>
            <p className="text-[11px] text-slate-500">
              {filteredItems.length} খরচ
            </p>
          </div>
          <Link
            href={`/dashboard/expenses/new?shopId=${shopId}`}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold shadow-sm"
          >
            + নতুন খরচ
          </Link>
        </div>
        <div className="px-2 space-y-2">
          <p className="text-[11px] font-semibold text-slate-500">📅 সময়</p>
          <DateFilterRow />
          <CustomRangeInputs />
        </div>
      </div>

      {/* Desktop filter row */}
      <div className="hidden md:block space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700">মোট খরচ</p>
            <p className="text-2xl font-bold text-slate-900">
              {totalAmount.toFixed(2)} ৳
            </p>
            <p className="text-xs text-slate-500">{filteredItems.length} খরচ</p>
          </div>
          <Link
            href={`/dashboard/expenses/new?shopId=${shopId}`}
            className="px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold shadow-sm hover:bg-emerald-700"
          >
            + নতুন খরচ
          </Link>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm px-4 py-3 space-y-2">
          <p className="text-xs font-semibold text-slate-500">📅 সময়</p>
          <DateFilterRow />
          <CustomRangeInputs />
        </div>
      </div>

      <div className="space-y-4">
        {filteredItems.map((e) => {
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
              className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-2xl font-bold text-slate-900">
                    {formattedAmount} ৳
                  </p>
                  <p className="text-sm font-semibold text-slate-700">
                    {e.category}
                  </p>
                  <p className="text-xs text-slate-500">তারিখ: {expenseDateStr}</p>
                  {e.note ? (
                    <p className="text-xs text-slate-500 leading-snug">
                      নোট: {e.note}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {online ? (
                    <Link
                      href={`/dashboard/expenses/${e.id}`}
                      className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-800 text-xs font-semibold border border-blue-100 hover:bg-blue-100"
                    >
                      দেখুন
                    </Link>
                  ) : (
                    <span className="text-[11px] text-slate-400">
                      Offline মোড
                    </span>
                  )}
                  <ExpensesDeleteButton id={e.id} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
