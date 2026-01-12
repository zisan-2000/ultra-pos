export type RangePreset = "today" | "yesterday" | "7d" | "month" | "all" | "custom";

const DHAKA_TIMEZONE = "Asia/Dhaka";

export const PREFETCH_PRESETS: Array<Exclude<RangePreset, "custom">> = [
  "today",
  "yesterday",
  "7d",
  "month",
  "all",
];

export function getDhakaDateString(date: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function computePresetRange(preset: Exclude<RangePreset, "custom">) {
  const today = new Date();
  if (preset === "today") {
    const d = getDhakaDateString(today);
    return { from: d, to: d };
  }
  if (preset === "yesterday") {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    const day = getDhakaDateString(d);
    return { from: day, to: day };
  }
  if (preset === "7d") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { from: getDhakaDateString(start), to: getDhakaDateString(today) };
  }
  if (preset === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: getDhakaDateString(start), to: getDhakaDateString(today) };
  }
  return { from: undefined, to: undefined };
}

export function computeRange(
  preset: RangePreset,
  customFrom?: string,
  customTo?: string
) {
  if (preset === "custom") {
    return { from: customFrom, to: customTo };
  }
  return computePresetRange(preset);
}
