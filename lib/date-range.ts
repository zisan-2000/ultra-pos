type RangeOptions = {
  dateOnlyTz: "dhaka" | "utc";
  clampTime: boolean;
};

function parseRangeValue(
  value: string | undefined,
  mode: "start" | "end",
  options: RangeOptions
) {
  if (!value) return undefined;
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (isDateOnly) {
    const offset = options.dateOnlyTz === "dhaka" ? "+06:00" : "Z";
    const iso =
      mode === "end"
        ? `${value}T23:59:59.999${offset}`
        : `${value}T00:00:00.000${offset}`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  if (options.clampTime) {
    if (mode === "start") d.setUTCHours(0, 0, 0, 0);
    if (mode === "end") d.setUTCHours(23, 59, 59, 999);
  }
  return d;
}

function parseDateRange(from?: string, to?: string, options?: Partial<RangeOptions>) {
  const resolved: RangeOptions = {
    dateOnlyTz: options?.dateOnlyTz ?? "dhaka",
    clampTime: options?.clampTime ?? false,
  };

  return {
    start: parseRangeValue(from, "start", resolved),
    end: parseRangeValue(to, "end", resolved),
  };
}

export function parseDhakaDateRange(from?: string, to?: string, clampTime = false) {
  return parseDateRange(from, to, { dateOnlyTz: "dhaka", clampTime });
}

export function parseUtcDateRange(from?: string, to?: string, clampTime = false) {
  return parseDateRange(from, to, { dateOnlyTz: "utc", clampTime });
}
