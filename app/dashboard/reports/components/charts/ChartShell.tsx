// app/dashboard/reports/components/charts/ChartShell.tsx
"use client";

import type { ReactNode } from "react";

type ChartShellProps = {
  title: string;
  subtitle?: string;
  /** Right-aligned slot for legends, badges, or quick toggles. */
  trailing?: ReactNode;
  /** Height of the chart canvas in px. Defaults to a mobile-friendly 220. */
  height?: number;
  /** When true, shows a skeleton instead of children. */
  loading?: boolean;
  /** When true, shows a friendly empty message instead of children. */
  empty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
};

/**
 * Standard wrapper around a recharts chart so every report chart looks the
 * same: rounded card, title row, consistent padding, mobile-friendly height,
 * built-in empty/loading states.
 */
export function ChartShell({
  title,
  subtitle,
  trailing,
  height = 220,
  loading = false,
  empty = false,
  emptyMessage = "এই সময়ে কোনো ডাটা নেই",
  children,
}: ChartShellProps) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/30">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{title}</p>
          {subtitle ? (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>
          ) : null}
        </div>
        {trailing ? (
          <div className="flex items-center gap-2 shrink-0">{trailing}</div>
        ) : null}
      </div>

      <div className="px-2 pt-3 pb-1 sm:px-4">
        {loading ? (
          <div
            className="animate-pulse rounded-xl bg-muted/40"
            style={{ height }}
          />
        ) : empty ? (
          <div
            className="flex items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20"
            style={{ height }}
          >
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          </div>
        ) : (
          <div style={{ height }}>{children}</div>
        )}
      </div>
    </div>
  );
}

/**
 * Bengali-friendly compact money formatter for Y-axis labels.
 * 1500 → "১.৫ক", 1_200_000 → "১২ল", 12_000 → "১২হা"
 */
export function formatCompactBn(value: number): string {
  const absVal = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  let num: string;
  let suffix: string;
  if (absVal >= 10_000_000) {
    num = (absVal / 10_000_000).toFixed(absVal % 10_000_000 === 0 ? 0 : 1);
    suffix = "কো";
  } else if (absVal >= 100_000) {
    num = (absVal / 100_000).toFixed(absVal % 100_000 === 0 ? 0 : 1);
    suffix = "ল";
  } else if (absVal >= 1_000) {
    num = (absVal / 1_000).toFixed(absVal % 1_000 === 0 ? 0 : 1);
    suffix = "হা";
  } else {
    num = absVal.toString();
    suffix = "";
  }
  return `${sign}${toBengaliDigits(num)}${suffix}`;
}

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

export function toBengaliDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

/**
 * Bengali short date label for X-axis (dd MMM, e.g. "১৪ মে").
 */
const BN_MONTH_SHORT = [
  "জানু",
  "ফেব",
  "মার্চ",
  "এপ্রি",
  "মে",
  "জুন",
  "জুলা",
  "আগ",
  "সেপ",
  "অক্টো",
  "নভে",
  "ডিসে",
];

export function formatShortDateBn(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = toBengaliDigits(String(d.getDate()).padStart(2, "0"));
  const month = BN_MONTH_SHORT[d.getMonth()] ?? "";
  return `${day} ${month}`;
}

/**
 * Bengali money formatter for tooltip (full precision with ৳).
 */
export function formatMoneyBnFull(value: number): string {
  return `৳ ${value.toLocaleString("bn-BD", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}
