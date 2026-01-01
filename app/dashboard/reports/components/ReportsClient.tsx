// app/dashboard/reports/components/ReportsClient.tsx

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SalesReport from "./SalesReport";
import ExpenseReport from "./ExpenseReport";
import CashbookReport from "./CashbookReport";
import ProfitTrendReport from "./ProfitTrendReport";
import PaymentMethodReport from "./PaymentMethodReport";
import TopProductsReport from "./TopProductsReport";
import LowStockReport from "./LowStockReport";
import ShopSelectorClient from "../ShopSelectorClient";
import { StatCard } from "./StatCard";

type Summary = {
  sales: { totalAmount: number; completedCount?: number; voidedCount?: number };
  expense: { totalAmount: number; count?: number };
  cash: { balance: number; totalIn: number; totalOut: number };
  profit: { profit: number; salesTotal: number; expenseTotal: number };
};

type Props = {
  shopId: string;
  shopName: string;
  shops: { id: string; name: string }[];
  summary: Summary;
};

const NAV = [
  { key: "summary", label: "সারাংশ" },
  { key: "sales", label: "বিক্রি" },
  { key: "expenses", label: "খরচ" },
  { key: "cash", label: "ক্যাশ" },
  { key: "payment", label: "পেমেন্ট" },
  { key: "profit", label: "লাভ" },
  { key: "products", label: "পণ্য" },
  { key: "stock", label: "লো স্টক" },
] as const;

type RangePreset = "today" | "yesterday" | "7d" | "month" | "all" | "custom";

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: "today", label: "আজ" },
  { key: "yesterday", label: "গতকাল" },
  { key: "7d", label: "৭ দিন" },
  { key: "month", label: "এই মাস" },
  { key: "all", label: "সব" },
  { key: "custom", label: "কাস্টম" },
];

function computeRange(
  preset: RangePreset,
  customFrom?: string,
  customTo?: string
) {
  const toDhakaDateStr = (d: Date) => {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(d);
  };
  const today = new Date();
  if (preset === "custom") {
    return { from: customFrom, to: customTo };
  }
  if (preset === "today") {
    const t = toDhakaDateStr(today);
    return { from: t, to: t };
  }
  if (preset === "yesterday") {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    const d = toDhakaDateStr(y);
    return { from: d, to: d };
  }
  if (preset === "7d") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { from: toDhakaDateStr(start), to: toDhakaDateStr(today) };
  }
  if (preset === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: toDhakaDateStr(start), to: toDhakaDateStr(today) };
  }
  return { from: undefined, to: undefined };
}

export default function ReportsClient({
  shopId,
  shopName,
  shops,
  summary,
}: Props) {
  const [active, setActive] = useState<(typeof NAV)[number]["key"]>("summary");
  const [preset, setPreset] = useState<RangePreset>("all");
  const [customFrom, setCustomFrom] = useState<string | undefined>(undefined);
  const [customTo, setCustomTo] = useState<string | undefined>(undefined);
  const range = useMemo(
    () => computeRange(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );
  const [liveSummary, setLiveSummary] = useState<Summary>(summary);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const summarySnapshot = `${liveSummary.sales.totalAmount.toFixed(
    1
  )}৳ বিক্রি · লাভ ${liveSummary.profit.profit.toFixed(1)}৳`;

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const params = new URLSearchParams({ shopId });
      if (range.from) params.append("from", range.from);
      if (range.to) params.append("to", range.to);
      const res = await fetch(`/api/reports/summary?${params.toString()}`);
      if (!res.ok) return;
      const json = await res.json();
      if (json && json.sales) {
        setLiveSummary(json as Summary);
      }
    } catch (err) {
      console.error("summary load failed", err);
    } finally {
      setSummaryLoading(false);
    }
  }, [shopId, range.from, range.to]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    if (preset === "custom" && customFrom && customTo && customFrom > customTo) {
      alert("শুরুর তারিখ শেষের তারিখের আগে হতে হবে");
    }
  }, [preset, customFrom, customTo]);

  const renderReport = () => {
    switch (active) {
      case "summary":
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard
              title="মোট বিক্রি"
              value={`${liveSummary.sales.totalAmount.toFixed(2)} ৳`}
              subtitle={`মোট বিল: ${liveSummary.sales.completedCount ?? 0}${
                typeof liveSummary.sales.voidedCount === "number"
                  ? ` · বাতিল: ${liveSummary.sales.voidedCount}`
                  : ""
              }`}
              icon="💰"
            />
            <StatCard
              title="খরচ"
              value={`${liveSummary.expense.totalAmount.toFixed(2)} ৳`}
              subtitle={`মোট খরচ: ${liveSummary.expense.count ?? 0}`}
              icon="💸"
            />
            <StatCard
              title="ক্যাশ ব্যালান্স"
              value={`${liveSummary.cash.balance.toFixed(2)} ৳`}
              subtitle={`ইন: ${liveSummary.cash.totalIn.toFixed(
                2
              )} ৳ | আউট: ${liveSummary.cash.totalOut.toFixed(2)} ৳`}
              icon="🏦"
            />
            <StatCard
              title="লাভ"
              value={`${liveSummary.profit.profit.toFixed(2)} ৳`}
              subtitle={`বিক্রি: ${liveSummary.profit.salesTotal.toFixed(
                2
              )} ৳ | খরচ: ${liveSummary.profit.expenseTotal.toFixed(2)} ৳`}
              icon="📈"
            />
          </div>
        );
      case "sales":
        return <SalesReport shopId={shopId} from={range.from} to={range.to} />;
      case "expenses":
        return (
          <ExpenseReport shopId={shopId} from={range.from} to={range.to} />
        );
      case "cash":
        return <CashbookReport shopId={shopId} from={range.from} to={range.to} />;
      case "payment":
        return (
          <PaymentMethodReport shopId={shopId} from={range.from} to={range.to} />
        );
      case "profit":
        return (
          <ProfitTrendReport shopId={shopId} from={range.from} to={range.to} />
        );
      case "products":
        return <TopProductsReport shopId={shopId} />;
      case "stock":
        return <LowStockReport shopId={shopId} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 leading-tight">
            রিপোর্ট ও বিশ্লেষণ
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            দোকান: <span className="font-semibold">{shopName}</span>
          </p>
          <p className="text-sm text-gray-500">
            বিক্রি, খরচ, ক্যাশ, লাভ এক জায়গায়
          </p>
        </div>

        <div className="flex items-center gap-3">
          <ShopSelectorClient shops={shops} selectedShopId={shopId} />
        </div>
      </div>

      {/* Mobile sticky controls */}
      <div className="md:hidden sticky top-0 z-30 space-y-3 bg-white/95 backdrop-blur border-b border-slate-100 py-2">
        <div className="px-2 space-y-1">
          <p className="text-[11px] font-semibold text-slate-500">📊 রিপোর্ট</p>
          <div className="relative">
            <div className="overflow-x-auto flex gap-2 pr-6">
              {NAV.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setActive(item.key)}
                  className={`px-3 py-2 rounded-full text-sm font-semibold whitespace-nowrap ${
                    active === item.key
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-800"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white to-transparent" />
          </div>
        </div>

        <div className="px-2 space-y-2">
          <p className="text-[11px] font-semibold text-slate-500">📅 সময়</p>
          <div className="relative">
            <div className="overflow-x-auto flex gap-2 pr-8 pb-1">
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
          {preset === "custom" && (
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
          )}
          <div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
              {summarySnapshot}
            </div>
          </div>
        </div>
      </div>

      {/* Desktop: primary tabs + date filter separated */}
      <div className="hidden md:block space-y-3">
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm px-4 py-3 relative">
          <p className="text-xs font-semibold text-slate-500 mb-2">📊 রিপোর্ট</p>
          <div className="relative">
            <div className="overflow-x-auto flex gap-2 pr-10">
              {NAV.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setActive(item.key)}
                  className={`px-3 py-2 rounded-full text-sm font-semibold whitespace-nowrap ${
                    active === item.key
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-800 hover:bg-slate-200"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white to-transparent" />
          </div>
        </div>

        <div className="rounded-xl bg-white border border-slate-200 shadow-sm px-4 py-3 space-y-3">
          <p className="text-xs font-semibold text-slate-500">📅 সময়</p>
          <div className="relative">
            <div className="overflow-x-auto flex items-center gap-2 pr-12 pb-1">
              {PRESETS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setPreset(key)}
                  className={`px-3.5 py-2 rounded-full text-sm font-semibold whitespace-nowrap ${
                    preset === key
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-50 text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white to-transparent" />
          </div>
          {preset === "custom" && (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                className="border border-slate-200 rounded px-2 py-1 text-sm"
                value={customFrom ?? ""}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <input
                type="date"
                className="border border-slate-200 rounded px-2 py-1 text-sm"
                value={customTo ?? ""}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          )}
          {summaryLoading && (
            <span className="text-xs text-slate-500">রিফ্রেশ হচ্ছে...</span>
          )}
        </div>
      </div>
      {/* Desktop grid */}
      <div className="hidden md:block space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatCard
              title="মোট বিক্রি"
              value={`${liveSummary.sales.totalAmount.toFixed(2)} ৳`}
              subtitle={`মোট বিল: ${liveSummary.sales.completedCount ?? 0}${
                typeof liveSummary.sales.voidedCount === "number"
                  ? ` · বাতিল: ${liveSummary.sales.voidedCount}`
                  : ""
              }`}
              icon="💰"
            />
            <StatCard
              title="খরচ"
              value={`${liveSummary.expense.totalAmount.toFixed(2)} ৳`}
              subtitle={`মোট খরচ: ${liveSummary.expense.count ?? 0}`}
              icon="💸"
            />
            <StatCard
              title="ক্যাশ ব্যালান্স"
              value={`${liveSummary.cash.balance.toFixed(2)} ৳`}
              subtitle={`ইন: ${liveSummary.cash.totalIn.toFixed(
                2
              )} ৳ | আউট: ${liveSummary.cash.totalOut.toFixed(2)} ৳`}
              icon="🏦"
            />
            <StatCard
              title="লাভ"
              value={`${liveSummary.profit.profit.toFixed(2)} ৳`}
              subtitle={`বিক্রি: ${liveSummary.profit.salesTotal.toFixed(
                2
              )} ৳ | খরচ: ${liveSummary.profit.expenseTotal.toFixed(2)} ৳`}
              icon="📈"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="border border-gray-200 rounded-lg p-6 bg-white shadow-sm">
            <SalesReport shopId={shopId} from={range.from} to={range.to} />
          </div>

          <div className="border border-gray-200 rounded-lg p-6 bg-white shadow-sm">
            <ExpenseReport shopId={shopId} from={range.from} to={range.to} />
          </div>

          <div className="border border-gray-200 rounded-lg p-6 bg-white shadow-sm">
            <CashbookReport shopId={shopId} from={range.from} to={range.to} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border border-gray-200 rounded-lg p-6 bg-white shadow-sm">
            <PaymentMethodReport shopId={shopId} from={range.from} to={range.to} />
          </div>

          <div className="border border-gray-200 rounded-lg p-6 bg-white shadow-sm">
            <ProfitTrendReport shopId={shopId} from={range.from} to={range.to} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border border-gray-200 rounded-lg p-6 bg-white shadow-sm">
            <TopProductsReport shopId={shopId} />
          </div>

          <div className="border border-gray-200 rounded-lg p-6 bg-white shadow-sm">
            <LowStockReport shopId={shopId} />
          </div>
        </div>
      </div>

      {/* Mobile single report view */}
      <div className="md:hidden">{renderReport()}</div>
    </div>
  );
}
