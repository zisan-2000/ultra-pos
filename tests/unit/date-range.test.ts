import assert from "node:assert/strict";
import { parseDhakaDateRange, parseUtcDateRange } from "../../lib/date-range.ts";
import { runSuite } from "./test-utils.ts";

export async function runDateRangeTests() {
  await runSuite("date-range helpers", [
    {
      name: "parses Dhaka date-only start/end with timezone offset",
      fn: () => {
        const { start, end } = parseDhakaDateRange("2026-02-19", "2026-02-20");
        assert.equal(start?.toISOString(), "2026-02-18T18:00:00.000Z");
        assert.equal(end?.toISOString(), "2026-02-20T17:59:59.999Z");
      },
    },
    {
      name: "parses UTC date-only start/end without timezone shift",
      fn: () => {
        const { start, end } = parseUtcDateRange("2026-02-19", "2026-02-20");
        assert.equal(start?.toISOString(), "2026-02-19T00:00:00.000Z");
        assert.equal(end?.toISOString(), "2026-02-20T23:59:59.999Z");
      },
    },
    {
      name: "clamps datetime input to start/end of day when requested",
      fn: () => {
        const { start, end } = parseUtcDateRange(
          "2026-02-19T11:40:00.000Z",
          "2026-02-19T11:40:00.000Z",
          true
        );
        assert.equal(start?.toISOString(), "2026-02-19T00:00:00.000Z");
        assert.equal(end?.toISOString(), "2026-02-19T23:59:59.999Z");
      },
    },
    {
      name: "returns undefined for invalid dates",
      fn: () => {
        const { start, end } = parseUtcDateRange("invalid", "invalid");
        assert.equal(start, undefined);
        assert.equal(end, undefined);
      },
    },
  ]);
}
