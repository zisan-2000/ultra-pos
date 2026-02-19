import assert from "node:assert/strict";
import {
  REPORT_ROW_LIMIT,
  ReportRangeValidationError,
  clampReportLimit,
  isReportRangeValidationError,
  validateBoundedReportRange,
} from "../../lib/reporting-config.ts";
import { runSuite } from "./test-utils.ts";

export async function runReportingConfigTests() {
  await runSuite("reporting-config helpers", [
    {
      name: "validates a bounded date range and returns inclusive day count",
      fn: () => {
    const result = validateBoundedReportRange("2026-02-01", "2026-02-10");
    assert.deepEqual(result, {
      from: "2026-02-01",
      to: "2026-02-10",
      totalDays: 10,
    });
      },
    },

    {
      name: "throws ReportRangeValidationError when date range is missing",
      fn: () => {
    assert.throws(
      () => validateBoundedReportRange(undefined, "2026-02-10"),
      ReportRangeValidationError
    );
    assert.throws(
      () => validateBoundedReportRange("2026-02-01", undefined),
      /from and to date are required/
    );
      },
    },

    {
      name: "throws on invalid date format",
      fn: () => {
    assert.throws(
      () => validateBoundedReportRange("02-01-2026", "2026-02-10"),
      /date must be in YYYY-MM-DD format/
    );
      },
    },

    {
      name: "throws when from date is after to date",
      fn: () => {
    assert.throws(
      () => validateBoundedReportRange("2026-02-20", "2026-02-10"),
      /from date cannot be after to date/
    );
      },
    },

    {
      name: "throws when date range exceeds maxDays",
      fn: () => {
    assert.throws(
      () => validateBoundedReportRange("2026-01-01", "2026-04-15", 90),
      /date range exceeds 90 days/
    );
      },
    },

    {
      name: "detects validation errors correctly",
      fn: () => {
    const error = new ReportRangeValidationError("bad range");
    assert.equal(isReportRangeValidationError(error), true);
    assert.equal(isReportRangeValidationError(new Error("other")), false);
      },
    },

    {
      name: "clamps report row limit safely",
      fn: () => {
    assert.equal(clampReportLimit(undefined), REPORT_ROW_LIMIT);
    assert.equal(clampReportLimit("not-number"), REPORT_ROW_LIMIT);
    assert.equal(clampReportLimit(0), 1);
    assert.equal(clampReportLimit(999), REPORT_ROW_LIMIT);
    assert.equal(clampReportLimit(11.8), 11);
      },
    },
  ]);
}
