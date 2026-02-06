export const REPORT_ROW_LIMIT = 20;
export const REPORT_MAX_RANGE_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export class ReportRangeValidationError extends Error {
  status = 422 as const;
  constructor(message: string) {
    super(message);
    this.name = "ReportRangeValidationError";
  }
}

function parseDateOnlyStrict(value: string) {
  if (!DATE_ONLY_RE.test(value)) return null;
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(d.getTime())) return null;
  const normalized = d.toISOString().slice(0, 10);
  return normalized === value ? d : null;
}

export function validateBoundedReportRange(
  from?: string,
  to?: string,
  maxDays = REPORT_MAX_RANGE_DAYS
) {
  if (!from || !to) {
    throw new ReportRangeValidationError("from and to date are required");
  }

  const start = parseDateOnlyStrict(from);
  const end = parseDateOnlyStrict(to);
  if (!start || !end) {
    throw new ReportRangeValidationError("date must be in YYYY-MM-DD format");
  }

  if (start.getTime() > end.getTime()) {
    throw new ReportRangeValidationError("from date cannot be after to date");
  }

  const totalDays = Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
  if (totalDays > maxDays) {
    throw new ReportRangeValidationError(
      `date range exceeds ${maxDays} days`
    );
  }

  return { from, to, totalDays };
}

export function isReportRangeValidationError(error: unknown) {
  return error instanceof ReportRangeValidationError;
}

export function clampReportLimit(value?: number | string | null) {
  const n = Number(value);
  if (!Number.isFinite(n)) return REPORT_ROW_LIMIT;
  return Math.max(1, Math.min(Math.floor(n), REPORT_ROW_LIMIT));
}
