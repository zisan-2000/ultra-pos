import assert from "node:assert/strict";
import { generateCSV } from "../../lib/utils/csv.ts";
import { runSuite } from "./test-utils.ts";

export async function runCsvUtilTests() {
  await runSuite("csv utility", [
    {
      name: "generates CSV rows in header order",
      fn: () => {
        const csv = generateCSV(["name", "amount"], [{ name: "Tea", amount: 50 }]);
        assert.equal(csv, "name,amount\nTea,50");
      },
    },
    {
      name: "escapes quotes, commas and new lines",
      fn: () => {
        const csv = generateCSV(
          ["name", "note"],
          [{ name: 'A "quoted", value', note: "line1\nline2" }]
        );
        assert.equal(
          csv,
          'name,note\n"A ""quoted"", value","line1\nline2"'
        );
      },
    },
    {
      name: "mitigates CSV formula injection with single quote prefix",
      fn: () => {
        const csv = generateCSV(["name"], [{ name: "=2+2" }]);
        assert.equal(csv, "name\n'=2+2");
      },
    },
    {
      name: "handles null and undefined values as empty strings",
      fn: () => {
        const csv = generateCSV(["a", "b"], [{ a: null, b: undefined }]);
        assert.equal(csv, "a,b\n,");
      },
    },
  ]);
}
