import assert from "node:assert/strict";
import {
  getDhakaBusinessDate,
  getDhakaDateOnlyRange,
  getDhakaDateString,
  getDhakaRangeFromDays,
  normalizeDhakaBusinessDate,
  parseDhakaDateOnlyRange,
  toDhakaBusinessDate,
} from "../../lib/dhaka-date.ts";
import { runSuite } from "./test-utils.ts";

export async function runDhakaDateTests() {
  await runSuite("dhaka-date helpers", [
    {
      name: "builds inclusive day range with endExclusive",
      fn: () => {
        const { start, endExclusive } = getDhakaRangeFromDays(
          "2026-02-01",
          "2026-02-01"
        );
        assert.equal(start.toISOString(), "2026-01-31T18:00:00.000Z");
        assert.equal(endExclusive.toISOString(), "2026-02-01T18:00:00.000Z");
      },
    },
    {
      name: "returns Dhaka-local date string",
      fn: () => {
        const date = new Date("2026-02-19T20:00:00.000Z");
        assert.equal(getDhakaDateString(date), "2026-02-20");
      },
    },
    {
      name: "returns business date in UTC midnight",
      fn: () => {
        const date = new Date("2026-02-19T20:00:00.000Z");
        const businessDate = getDhakaBusinessDate(date);
        assert.equal(businessDate.toISOString(), "2026-02-20T00:00:00.000Z");
      },
    },
    {
      name: "normalizes UTC boundary inputs without shifting day",
      fn: () => {
        const start = normalizeDhakaBusinessDate("2026-02-19T00:00:00.000Z");
        const end = normalizeDhakaBusinessDate("2026-02-19T23:59:59.999Z");
        assert.equal(start.toISOString(), "2026-02-19T00:00:00.000Z");
        assert.equal(end.toISOString(), "2026-02-19T00:00:00.000Z");
      },
    },
    {
      name: "converts non-boundary time into Dhaka business date",
      fn: () => {
        const normalized = normalizeDhakaBusinessDate("2026-02-19T20:00:00.000Z");
        assert.equal(normalized.toISOString(), "2026-02-20T00:00:00.000Z");
      },
    },
    {
      name: "toDhakaBusinessDate handles invalid input safely",
      fn: () => {
        const normalized = toDhakaBusinessDate("not-a-date");
        assert.equal(Number.isNaN(normalized.getTime()), false);
      },
    },
    {
      name: "parses date-only range in UTC boundaries",
      fn: () => {
        const { start, end } = parseDhakaDateOnlyRange(
          "2026-02-01",
          "2026-02-02",
          true
        );
        assert.equal(start?.toISOString(), "2026-02-01T00:00:00.000Z");
        assert.equal(end?.toISOString(), "2026-02-02T23:59:59.999Z");
      },
    },
    {
      name: "returns today range helper with start and end values",
      fn: () => {
        const { start, end } = getDhakaDateOnlyRange(new Date("2026-02-19T00:00:00.000Z"));
        assert.equal(Boolean(start), true);
        assert.equal(Boolean(end), true);
      },
    },
  ]);
}
