import assert from "node:assert/strict";
import { getStockTone, getStockToneClasses } from "../../lib/stock-level.ts";
import { runSuite } from "./test-utils.ts";

export async function runStockLevelTests() {
  await runSuite("stock-level helpers", [
    {
      name: "maps numeric stock values to correct tones",
      fn: () => {
        assert.equal(getStockTone(-1), "danger");
        assert.equal(getStockTone(0), "danger");
        assert.equal(getStockTone(2), "warning-strong");
        assert.equal(getStockTone(5), "warning");
        assert.equal(getStockTone(10), "ok");
      },
    },
    {
      name: "returns ok tone for non-finite values",
      fn: () => {
        assert.equal(getStockTone(Number.NaN), "ok");
        assert.equal(getStockTone(Number.POSITIVE_INFINITY), "ok");
      },
    },
    {
      name: "returns style class maps by tone",
      fn: () => {
        const danger = getStockToneClasses(0);
        const warningStrong = getStockToneClasses(3);
        const warning = getStockToneClasses(5);
        const ok = getStockToneClasses(12);

        assert.equal(danger.badge.includes("text-danger"), true);
        assert.equal(warningStrong.badge.includes("text-warning"), true);
        assert.equal(warning.badge.includes("text-warning"), true);
        assert.equal(ok.badge.includes("text-success"), true);
      },
    },
  ]);
}
