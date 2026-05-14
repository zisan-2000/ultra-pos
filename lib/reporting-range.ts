export type RangePreset = "today" | "yesterday" | "7d" | "month" | "custom";

const DHAKA_TIMEZONE = "Asia/Dhaka";

export const PREFETCH_PRESETS: Array<Exclude<RangePreset, "custom">> = [
  "today",
  "yesterday",
  "7d",
  "month",
];

export function getDhakaDateString(date: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseYmd(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return { year, month, day };
}

function toUtcDate(value: string) {
  const parts = parseYmd(value);
  if (!parts) return null;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatUtcDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateStr: string, days: number) {
  const date = toUtcDate(dateStr);
  if (!date) return dateStr;
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDate(date);
}

function monthStart(dateStr: string) {
  const parts = parseYmd(dateStr);
  if (!parts) return dateStr;
  return `${parts.year}-${`${parts.month}`.padStart(2, "0")}-01`;
}

export function computePresetRange(preset: Exclude<RangePreset, "custom">) {
  const today = getDhakaDateString();
  if (preset === "today") {
    return { from: today, to: today };
  }
  if (preset === "yesterday") {
    const day = addDays(today, -1);
    return { from: day, to: day };
  }
  if (preset === "7d") {
    return { from: addDays(today, -6), to: today };
  }
  if (preset === "month") {
    return { from: monthStart(today), to: today };
  }
  return { from: today, to: today };
}

export function computeRange(
  preset: RangePreset,
  customFrom?: string,
  customTo?: string
) {
  if (preset === "custom") {
    if (customFrom && customTo) return { from: customFrom, to: customTo };
    if (customFrom) return { from: customFrom, to: customFrom };
    if (customTo) return { from: customTo, to: customTo };
    const today = getDhakaDateString();
    return { from: today, to: today };
  }
  return computePresetRange(preset);
}

export function getDateRangeSpanDays(from?: string, to?: string) {
  if (!from || !to) return null;
  const start = toUtcDate(from);
  const end = toUtcDate(to);
  if (!start || !end) return null;
  const delta = end.getTime() - start.getTime();
  return Math.floor(delta / (24 * 60 * 60 * 1000)) + 1;
}

/**
 * Given a current date range, returns the immediately-preceding range of equal length.
 * Used for period-over-period comparison.
 *
 * Examples:
 *   today (2026-05-14 → 2026-05-14)        → 2026-05-13 → 2026-05-13
 *   week  (2026-05-08 → 2026-05-14, 7 days) → 2026-05-01 → 2026-05-07
 *   month (2026-05-01 → 2026-05-14, 14 days)→ 2026-04-17 → 2026-04-30
 *
 * Returns null if the input range is invalid.
 */
export function computePreviousRange(from?: string, to?: string) {
  const span = getDateRangeSpanDays(from, to);
  if (!span || span <= 0 || !from || !to) return null;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(span - 1));
  return { from: prevFrom, to: prevTo };
}

/**
 * Calculate percentage delta between current and previous numeric values.
 * Returns null when previous is zero/missing (no meaningful comparison),
 * otherwise a signed percentage (e.g. +12.5, -8.3, 0).
 */
export function computeDeltaPct(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) {
    if (current === 0) return 0;
    return null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Convert a numeric delta into a direction discriminant.
 * Treats < 0.5% absolute change as "flat" to avoid visual noise.
 */
export function deltaDirection(pct: number | null): "up" | "down" | "flat" {
  if (pct === null || !Number.isFinite(pct)) return "flat";
  if (Math.abs(pct) < 0.5) return "flat";
  return pct > 0 ? "up" : "down";
}
