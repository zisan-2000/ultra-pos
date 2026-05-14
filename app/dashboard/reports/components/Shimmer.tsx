// app/dashboard/reports/components/Shimmer.tsx
//
// Unified loading primitives used by every report sub-component. Replaces the
// patchwork of ad-hoc animate-pulse markup and inconsistent loading texts
// ("লোড হচ্ছে...", "আপডেট হচ্ছে...", "রিফ্রেশ হচ্ছে...") with a single
// visual language so the whole reports section breathes the same rhythm.
"use client";

import { cn } from "@/lib/utils";

const BASE = "animate-pulse rounded bg-muted/70";

/** Small horizontal bar — use for inline text-shaped loading hints. */
export function ShimmerLine({
  className,
  width,
}: {
  className?: string;
  width?: string | number;
}) {
  return (
    <div
      className={cn(BASE, "h-3", className)}
      style={width !== undefined ? { width } : undefined}
    />
  );
}

/** Generic rectangular block — use for charts, cards, or big values. */
export function ShimmerBlock({ className }: { className?: string }) {
  return <div className={cn(BASE, className)} />;
}

/**
 * Single skeleton row that mimics a tabular row layout. The first column is
 * fixed-width (looks like a label), the last is right-aligned (looks like a
 * value), the middle columns flex to fill. Driven entirely by `cols`.
 */
export function TableRowShimmer({
  cols = 5,
  className,
}: {
  cols?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 px-4 py-3", className)}>
      {Array.from({ length: cols }).map((_, i) => {
        const isFirst = i === 0;
        const isLast = i === cols - 1;
        const widthCls = isFirst
          ? "w-24"
          : isLast
            ? "w-20 ml-auto"
            : "flex-1";
        return <div key={i} className={cn(BASE, "h-4", widthCls)} />;
      })}
    </div>
  );
}

/** A full skeleton "table" with N rows, used while a paginated list loads. */
export function TableShimmer({
  rows = 6,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <TableRowShimmer key={i} cols={cols} />
      ))}
    </div>
  );
}

/**
 * Inline "refreshing" indicator — replaces the older inconsistent strings
 * ("আপডেট হচ্ছে...", "রিফ্রেশ হচ্ছে...") with a single pill that fades in
 * when `visible` is true.
 */
export function RefreshingPill({
  visible = true,
  label = "আপডেট হচ্ছে...",
  className,
}: {
  visible?: boolean;
  label?: string;
  className?: string;
}) {
  if (!visible) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse"
      />
      {label}
    </span>
  );
}

/**
 * A standalone "report is loading from scratch" skeleton used when a tab is
 * mounted but no data has arrived yet. Card-shaped, fits where the actual
 * report card would.
 */
export function ReportLoadingCard({
  rows = 6,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="space-y-2">
          <ShimmerLine width={120} />
          <ShimmerLine width={180} />
        </div>
        <RefreshingPill label="লোড হচ্ছে..." />
      </div>
      <TableShimmer rows={rows} cols={cols} />
    </div>
  );
}
