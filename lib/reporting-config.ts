export const REPORT_ROW_LIMIT = 20;

export function clampReportLimit(value?: number | string | null) {
  const n = Number(value);
  if (!Number.isFinite(n)) return REPORT_ROW_LIMIT;
  return Math.max(1, Math.min(Math.floor(n), REPORT_ROW_LIMIT));
}
