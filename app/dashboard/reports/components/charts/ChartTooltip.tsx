// app/dashboard/reports/components/charts/ChartTooltip.tsx
"use client";

import { formatMoneyBnFull, formatShortDateBn } from "./ChartShell";

type Variant = "money" | "raw";

type LegendItem = {
  label: string;
  color: string;
  value: number;
};

// Recharts injects these props into the `content` element at runtime. The
// public TooltipProps type evolves between major versions, so we accept the
// runtime shape here without binding to a specific version's type signature.
type TooltipRenderProps = {
  active?: boolean;
  label?: string | number;
  payload?: Array<{
    name?: string | number;
    value?: number | string | null;
    color?: string;
    payload?: unknown;
  }>;
};

type ChartTooltipProps = TooltipRenderProps & {
  variant?: Variant;
  formatLabel?: (raw: string | number | undefined) => string;
};

/**
 * Shared tooltip used across all report charts. Renders a clean card with
 * the X-axis label (date) as header, and each series as a colored row with
 * its value formatted in Bengali money or raw number.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  variant = "money",
  formatLabel,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const headerLabel = formatLabel
    ? formatLabel(label)
    : typeof label === "string" && /^\d{4}-\d{2}-\d{2}/.test(label)
      ? formatShortDateBn(label)
      : String(label ?? "");

  const items: LegendItem[] = payload
    .filter((p) => typeof p.value === "number")
    .map((p) => ({
      label: String(p.name ?? ""),
      color: p.color ?? "#94a3b8",
      value: Number(p.value),
    }));

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-[0_10px_24px_rgba(15,23,42,0.14)]">
      {headerLabel ? (
        <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">
          {headerLabel}
        </p>
      ) : null}
      <div className="space-y-1">
        {items.map((it, idx) => (
          <div key={`${it.label}-${idx}`} className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: it.color }}
            />
            <span className="text-[11px] text-foreground/80 whitespace-nowrap">
              {it.label}
            </span>
            <span className="ml-auto text-xs font-semibold text-foreground tabular-nums whitespace-nowrap">
              {variant === "money"
                ? formatMoneyBnFull(it.value)
                : it.value.toLocaleString("bn-BD")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
