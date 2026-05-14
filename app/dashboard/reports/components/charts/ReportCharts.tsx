// app/dashboard/reports/components/charts/ReportCharts.tsx
"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartShell,
  formatCompactBn,
  formatMoneyBnFull,
  formatShortDateBn,
  toBengaliDigits,
} from "./ChartShell";
import { ChartTooltip } from "./ChartTooltip";

const AXIS_TICK_STYLE = {
  fontSize: 11,
  fill: "var(--muted-foreground, #64748b)",
} as const;

const GRID_COLOR = "rgba(148, 163, 184, 0.18)";

// ============================================================================
// Sales Trend — daily bars
// ============================================================================

export type DailyRow = { date: string; total: number };

type SalesTrendChartProps = {
  data: DailyRow[];
  loading?: boolean;
  /** Caption shown under the title (e.g. "এই পাতার ডাটা অনুযায়ী"). */
  caption?: string;
  trailing?: React.ReactNode;
};

export function SalesTrendChart({
  data,
  loading = false,
  caption,
  trailing,
}: SalesTrendChartProps) {
  const empty = !loading && data.length < 2;

  return (
    <ChartShell
      title="বিক্রির ট্রেন্ড"
      subtitle={caption ?? "দিনভিত্তিক মোট বিক্রি"}
      trailing={trailing}
      loading={loading}
      empty={empty}
      emptyMessage="ট্রেন্ড দেখাতে অন্তত ২ দিনের ডাটা প্রয়োজন"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
          <XAxis
            dataKey="date"
            tick={AXIS_TICK_STYLE}
            tickFormatter={formatShortDateBn}
            tickLine={false}
            axisLine={{ stroke: GRID_COLOR }}
          />
          <YAxis
            tick={AXIS_TICK_STYLE}
            tickFormatter={formatCompactBn}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            cursor={{ fill: "rgba(148, 163, 184, 0.10)" }}
            content={
              <ChartTooltip variant="money" formatLabel={(l) => formatShortDateBn(String(l ?? ""))} />
            }
          />
          <Bar
            dataKey="total"
            name="বিক্রি"
            fill="#10b981"
            radius={[6, 6, 0, 0]}
            maxBarSize={48}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

// ============================================================================
// Payment Method — donut
// ============================================================================

export type PaymentSlice = {
  key: string;
  label: string;
  total: number;
  color: string;
};

type PaymentDonutProps = {
  data: PaymentSlice[];
  loading?: boolean;
};

export function PaymentMethodDonut({ data, loading = false }: PaymentDonutProps) {
  const total = useMemo(() => data.reduce((s, d) => s + d.total, 0), [data]);
  const empty = !loading && (data.length === 0 || total <= 0);

  return (
    <ChartShell
      title="পেমেন্ট পদ্ধতির ভাগ"
      subtitle={`এই তালিকার ${toBengaliDigits(data.length)} টি পদ্ধতি`}
      loading={loading}
      empty={empty}
      height={220}
    >
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-center h-full">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Tooltip
              content={<ChartTooltip variant="money" formatLabel={() => ""} />}
            />
            <Pie
              data={data}
              dataKey="total"
              nameKey="label"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((slice) => (
                <Cell key={slice.key} fill={slice.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        <ul className="space-y-1.5 pr-2 pb-2 sm:pb-0 sm:pr-3">
          {data.map((slice) => {
            const pct = total > 0 ? (slice.total / total) * 100 : 0;
            return (
              <li key={slice.key} className="flex items-center gap-2 text-xs">
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: slice.color }}
                />
                <span className="text-foreground/80 whitespace-nowrap">{slice.label}</span>
                <span className="ml-auto tabular-nums text-muted-foreground">
                  {toBengaliDigits(pct.toFixed(0))}%
                </span>
                <span className="tabular-nums font-semibold text-foreground whitespace-nowrap">
                  {formatMoneyBnFull(slice.total)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </ChartShell>
  );
}

// ============================================================================
// Profit Trend — multi-line (sales, expense, profit)
// ============================================================================

export type ProfitTrendRow = {
  date: string;
  sales: number;
  expense: number;
  netProfit: number;
};

type ProfitTrendChartProps = {
  data: ProfitTrendRow[];
  loading?: boolean;
  trailing?: React.ReactNode;
};

export function ProfitTrendChart({
  data,
  loading = false,
  trailing,
}: ProfitTrendChartProps) {
  const empty = !loading && data.length < 2;

  return (
    <ChartShell
      title="লাভ-ক্ষতির ট্রেন্ড"
      subtitle="বিক্রি · খরচ · নিট লাভ — দিনভিত্তিক"
      trailing={trailing}
      loading={loading}
      empty={empty}
      emptyMessage="ট্রেন্ড দেখাতে অন্তত ২ দিনের ডাটা প্রয়োজন"
      height={260}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
          <XAxis
            dataKey="date"
            tick={AXIS_TICK_STYLE}
            tickFormatter={formatShortDateBn}
            tickLine={false}
            axisLine={{ stroke: GRID_COLOR }}
          />
          <YAxis
            tick={AXIS_TICK_STYLE}
            tickFormatter={formatCompactBn}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            content={
              <ChartTooltip variant="money" formatLabel={(l) => formatShortDateBn(String(l ?? ""))} />
            }
          />
          <Line
            type="monotone"
            dataKey="sales"
            name="বিক্রি"
            stroke="#10b981"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="expense"
            name="খরচ"
            stroke="#ef4444"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="netProfit"
            name="নিট লাভ"
            stroke="#6366f1"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Mini legend below the chart */}
      <div className="flex flex-wrap items-center gap-3 px-2 pt-2 pb-1 text-[11px] font-semibold">
        <LegendDot color="#10b981" label="বিক্রি" />
        <LegendDot color="#ef4444" label="খরচ" />
        <LegendDot color="#6366f1" label="নিট লাভ" />
      </div>
    </ChartShell>
  );
}

// ============================================================================
// Cash Flow — area chart of daily net (in - out)
// ============================================================================

export type CashFlowRow = {
  date: string;
  in: number;
  out: number;
  net: number;
};

type CashFlowChartProps = {
  data: CashFlowRow[];
  loading?: boolean;
  trailing?: React.ReactNode;
};

export function CashFlowChart({ data, loading = false, trailing }: CashFlowChartProps) {
  const empty = !loading && data.length < 2;

  return (
    <ChartShell
      title="ক্যাশের গতি"
      subtitle="দিনভিত্তিক ক্যাশ ইন · ক্যাশ আউট · নিট"
      trailing={trailing}
      loading={loading}
      empty={empty}
      emptyMessage="চার্ট দেখাতে অন্তত ২ দিনের ডাটা প্রয়োজন"
      height={240}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="cashInGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="cashOutGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
          <XAxis
            dataKey="date"
            tick={AXIS_TICK_STYLE}
            tickFormatter={formatShortDateBn}
            tickLine={false}
            axisLine={{ stroke: GRID_COLOR }}
          />
          <YAxis
            tick={AXIS_TICK_STYLE}
            tickFormatter={formatCompactBn}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            content={
              <ChartTooltip variant="money" formatLabel={(l) => formatShortDateBn(String(l ?? ""))} />
            }
          />
          <Area
            type="monotone"
            dataKey="in"
            name="ক্যাশ ইন"
            stroke="#10b981"
            strokeWidth={2}
            fill="url(#cashInGradient)"
          />
          <Area
            type="monotone"
            dataKey="out"
            name="ক্যাশ আউট"
            stroke="#ef4444"
            strokeWidth={2}
            fill="url(#cashOutGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap items-center gap-3 px-2 pt-2 pb-1 text-[11px] font-semibold">
        <LegendDot color="#10b981" label="ক্যাশ ইন" />
        <LegendDot color="#ef4444" label="ক্যাশ আউট" />
      </div>
    </ChartShell>
  );
}

// ============================================================================
// Small helpers
// ============================================================================

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-foreground/80">{label}</span>
    </span>
  );
}
