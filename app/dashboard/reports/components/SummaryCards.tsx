// app/dashboard/reports/components/SummaryCards.tsx
"use client";

import { useState } from "react";
import { StatCard } from "./StatCard";
import {
  amountToBanglaWords,
  formatBanglaMoney,
} from "@/lib/utils/bangla-money";
import { computeDeltaPct, deltaDirection } from "@/lib/reporting-range";

export type SummaryShape = {
  sales: {
    totalAmount: number;
    discountAmount?: number;
    taxAmount?: number;
    completedCount?: number;
    voidedCount?: number;
    count?: number;
  };
  expense: { totalAmount: number; count?: number };
  cash: { balance: number; totalIn: number; totalOut: number };
  profit: {
    profit: number;
    salesTotal: number;
    expenseTotal: number;
    cogs?: number;
  };
};

export type DrillTab =
  | "summary"
  | "sales"
  | "expenses"
  | "cash"
  | "payment"
  | "profit"
  | "products"
  | "stock"
  | "valuation";

type Props = {
  summary: SummaryShape;
  /** Same-shape summary for the immediately-preceding period, used to compute deltas. */
  previousSummary?: SummaryShape | null;
  /** Optional human-readable label like "আগের ৭ দিনের তুলনায়" — shown in the delta tooltip. */
  comparisonLabel?: string | null;
  needsCogs?: boolean;
  className?: string;
  /** When provided, each KPI card becomes clickable and routes to the matching report tab. */
  onSelectTab?: (tab: DrillTab) => void;
};

function buildDelta(
  current: number,
  previous: number | undefined,
  goodWhen: "up" | "down",
  label?: string | null
) {
  if (previous === undefined) return undefined;
  const pct = computeDeltaPct(current, previous);
  return {
    pct,
    direction: deltaDirection(pct),
    goodWhen,
    label: label ?? undefined,
  };
}

export function SummaryCards({
  summary,
  previousSummary,
  comparisonLabel,
  needsCogs = false,
  className = "grid grid-cols-1 sm:grid-cols-2 gap-3",
  onSelectTab,
}: Props) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const salesDelta = buildDelta(
    summary.sales.totalAmount,
    previousSummary?.sales.totalAmount,
    "up",
    comparisonLabel
  );
  const expenseDelta = buildDelta(
    summary.expense.totalAmount,
    previousSummary?.expense.totalAmount,
    "down",
    comparisonLabel
  );
  const cogsDelta = buildDelta(
    summary.profit.cogs ?? 0,
    previousSummary?.profit.cogs,
    "down",
    comparisonLabel
  );
  const cashDelta = buildDelta(
    summary.cash.balance,
    previousSummary?.cash.balance,
    "up",
    comparisonLabel
  );
  const profitDelta = buildDelta(
    summary.profit.profit,
    previousSummary?.profit.profit,
    "up",
    comparisonLabel
  );

  const handleSelect = (tab: DrillTab) =>
    onSelectTab ? () => onSelectTab(tab) : undefined;

  return (
    <div className={className}>
      <StatCard
        title="মোট বিক্রি"
        value={formatBanglaMoney(summary.sales.totalAmount)}
        amountInWords={amountToBanglaWords(summary.sales.totalAmount)}
        expanded={expandedKey === "sales"}
        onToggleWords={() =>
          setExpandedKey((current) => (current === "sales" ? null : "sales"))
        }
        wordsId="reports-summary-words-sales"
        subtitle={`মোট বিল: ${summary.sales.completedCount ?? 0}${
          typeof summary.sales.voidedCount === "number"
            ? ` · বাতিল: ${summary.sales.voidedCount}`
            : ""
        }${
          Number(summary.sales.discountAmount ?? 0) > 0
            ? ` · ছাড়: ${Number(summary.sales.discountAmount ?? 0).toFixed(2)} ৳`
            : ""
        }${
          Number(summary.sales.taxAmount ?? 0) > 0
            ? ` · VAT/Tax: ${Number(summary.sales.taxAmount ?? 0).toFixed(2)} ৳`
            : ""
        }`}
        icon="🧾"
        tone="success"
        delta={salesDelta}
        onClick={handleSelect("sales")}
        clickLabel="বিক্রির বিস্তারিত দেখুন"
      />
      <StatCard
        title="খরচ"
        value={formatBanglaMoney(summary.expense.totalAmount)}
        amountInWords={amountToBanglaWords(summary.expense.totalAmount)}
        expanded={expandedKey === "expense"}
        onToggleWords={() =>
          setExpandedKey((current) =>
            current === "expense" ? null : "expense"
          )
        }
        wordsId="reports-summary-words-expense"
        subtitle={`মোট খরচ: ${summary.expense.count ?? 0}`}
        icon="💸"
        tone="danger"
        delta={expenseDelta}
        onClick={handleSelect("expenses")}
        clickLabel="খরচের বিস্তারিত দেখুন"
      />
      {needsCogs ? (
        <StatCard
          title="COGS"
          value={formatBanglaMoney(summary.profit.cogs ?? 0)}
          amountInWords={amountToBanglaWords(summary.profit.cogs ?? 0)}
          expanded={expandedKey === "cogs"}
          onToggleWords={() =>
            setExpandedKey((current) => (current === "cogs" ? null : "cogs"))
          }
          wordsId="reports-summary-words-cogs"
          subtitle="বিক্রিত পণ্যের খরচ"
          icon="📦"
          tone="warning"
          delta={cogsDelta}
          onClick={handleSelect("profit")}
          clickLabel="লাভ-ক্ষতির বিস্তারিত দেখুন"
        />
      ) : null}
      <StatCard
        title="ক্যাশ ব্যালান্স"
        value={formatBanglaMoney(summary.cash.balance)}
        amountInWords={amountToBanglaWords(summary.cash.balance)}
        expanded={expandedKey === "cash"}
        onToggleWords={() =>
          setExpandedKey((current) => (current === "cash" ? null : "cash"))
        }
        wordsId="reports-summary-words-cash"
        subtitle={`ইন: ${summary.cash.totalIn.toFixed(2)} ৳ | আউট: ${summary.cash.totalOut.toFixed(2)} ৳`}
        icon="💵"
        tone="warning"
        delta={cashDelta}
        onClick={handleSelect("cash")}
        clickLabel="ক্যাশ লেজার দেখুন"
      />
      <StatCard
        title="লাভ"
        value={formatBanglaMoney(summary.profit.profit)}
        amountInWords={amountToBanglaWords(summary.profit.profit)}
        expanded={expandedKey === "profit"}
        onToggleWords={() =>
          setExpandedKey((current) =>
            current === "profit" ? null : "profit"
          )
        }
        wordsId="reports-summary-words-profit"
        subtitle={`বিক্রি: ${summary.profit.salesTotal.toFixed(
          2
        )} ৳ | খরচ: ${summary.profit.expenseTotal.toFixed(2)} ৳`}
        icon="📈"
        tone="primary"
        delta={profitDelta}
        onClick={handleSelect("profit")}
        clickLabel="লাভ-ক্ষতির বিস্তারিত দেখুন"
      />
    </div>
  );
}

export function SummaryCardsSkeleton({
  needsCogs = false,
  className = "grid grid-cols-1 sm:grid-cols-2 gap-3",
}: {
  needsCogs?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      {Array.from({ length: needsCogs ? 5 : 4 }).map((_, idx) => (
        <div
          key={idx}
          className="animate-pulse rounded-2xl border border-border bg-card p-4 space-y-3"
        >
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="h-6 w-32 rounded bg-muted" />
          <div className="h-3 w-36 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
