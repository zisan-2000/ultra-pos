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
