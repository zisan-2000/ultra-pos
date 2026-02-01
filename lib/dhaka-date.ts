import { parseUtcDateRange } from "@/lib/date-range";

const DHAKA_TZ_OFFSET = "+06:00";
const DHAKA_TIMEZONE = "Asia/Dhaka";

export function getDhakaRangeFromDays(from: string, to: string) {
  const start = new Date(`${from}T00:00:00.000${DHAKA_TZ_OFFSET}`);
  const endStart = new Date(`${to}T00:00:00.000${DHAKA_TZ_OFFSET}`);
  const endExclusive = new Date(
    endStart.getTime() + 24 * 60 * 60 * 1000
  );
  return { start, endExclusive };
}

export function getDhakaDayRange(date: Date = new Date()) {
  const day = getDhakaDateString(date);
  const start = new Date(`${day}T00:00:00.000${DHAKA_TZ_OFFSET}`);
  const end = new Date(`${day}T23:59:59.999${DHAKA_TZ_OFFSET}`);
  return { start, end };
}

export function getDhakaDateString(date: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getDhakaDateOnlyRange(date: Date = new Date()) {
  const day = getDhakaDateString(date);
  const { start, end } = parseUtcDateRange(day, day, true);
  return { start, end };
}
