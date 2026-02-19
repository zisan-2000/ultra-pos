import assert from "node:assert/strict";
import {
  computeRange,
  getDateRangeSpanDays,
  getDhakaDateString,
} from "../../lib/reporting-range.ts";
import { runSuite } from "./test-utils.ts";

export async function runReportingRangeTests() {
  await runSuite("reporting-range helpers", [
    {
      name: "computes custom range with explicit from and to",
      fn: () => {
        const range = computeRange("custom", "2026-02-01", "2026-02-10");
        assert.deepEqual(range, { from: "2026-02-01", to: "2026-02-10" });
      },
    },
    {
      name: "uses single day when custom range has only one boundary",
      fn: () => {
        const fromOnly = computeRange("custom", "2026-02-01");
        const toOnly = computeRange("custom", undefined, "2026-02-03");
        assert.deepEqual(fromOnly, { from: "2026-02-01", to: "2026-02-01" });
        assert.deepEqual(toOnly, { from: "2026-02-03", to: "2026-02-03" });
      },
    },
    {
      name: "returns Dhaka date string from provided date",
      fn: () => {
        const dateStr = getDhakaDateString(new Date("2026-02-19T20:00:00.000Z"));
        assert.equal(dateStr, "2026-02-20");
      },
    },
    {
      name: "computes inclusive span days for valid ranges",
      fn: () => {
        assert.equal(getDateRangeSpanDays("2026-02-01", "2026-02-01"), 1);
        assert.equal(getDateRangeSpanDays("2026-02-01", "2026-02-10"), 10);
      },
    },
    {
      name: "returns null for invalid span ranges",
      fn: () => {
        assert.equal(getDateRangeSpanDays(undefined, "2026-02-10"), null);
        assert.equal(getDateRangeSpanDays("bad", "2026-02-10"), null);
      },
    },
  ]);
}
