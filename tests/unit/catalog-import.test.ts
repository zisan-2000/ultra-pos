import assert from "node:assert/strict";
import {
  createCatalogImportCsvTemplate,
  createCatalogImportTemplate,
  parseCatalogCsvMatrix,
  parseCatalogImportPayload,
} from "../../lib/catalog-import.ts";
import { runSuite } from "./test-utils.ts";

export async function runCatalogImportTests() {
  await runSuite("catalog import helpers", [
    {
      name: "parses JSON payload and removes duplicate names per business type",
      fn: () => {
        const payload = JSON.stringify([
          { name: "Milk", businessType: "mini_grocery", aliases: ["fresh milk"] },
          { name: "Milk", businessType: "mini_grocery", aliases: ["cow milk"] },
          { name: "Milk", businessType: "pharmacy", aliases: ["powder milk"] },
        ]);

        const result = parseCatalogImportPayload(payload, "json", null);

        assert.equal(result.errors.length, 0);
        assert.equal(result.duplicateCount, 1);
        assert.equal(result.items.length, 2);
        assert.equal(result.items[0]?.aliases?.[0]?.alias, "fresh milk");
        assert.equal(result.items[1]?.businessType, "pharmacy");
      },
    },
    {
      name: "parses CSV payload with quoted values and pipe-separated aliases and barcodes",
      fn: () => {
        const payload = [
          "name,businessType,aliases,barcodes,isActive,sourceType",
          '"Fresh Milk","mini_grocery","milk | fresh milk","890 123 | 456",false,imported',
        ].join("\n");

        const result = parseCatalogImportPayload(payload, "csv", null);

        assert.equal(result.errors.length, 0);
        assert.equal(result.items.length, 1);
        assert.equal(result.items[0]?.name, "Fresh Milk");
        assert.deepEqual(
          result.items[0]?.aliases?.map((item) => item.alias),
          ["milk", "fresh milk"],
        );
        assert.deepEqual(
          result.items[0]?.barcodes?.map((item) => item.code),
          ["890123", "456"],
        );
        assert.equal(result.items[0]?.isActive, false);
        assert.equal(result.items[0]?.sourceType, "imported");
      },
    },
    {
      name: "rejects CSV payload without a name column",
      fn: () => {
        const payload = "brand,category\nAcme,Dairy";
        const result = parseCatalogImportPayload(payload, "csv", null);

        assert.equal(result.items.length, 0);
        assert.match(result.errors[0] ?? "", /name/i);
      },
    },
    {
      name: "parses CSV matrix with escaped quotes and embedded new lines",
      fn: () => {
        const matrix = parseCatalogCsvMatrix('name,note\n"Tea","line 1\nline ""2"""');

        assert.equal(matrix.length, 2);
        assert.deepEqual(matrix[1], ["Tea", 'line 1\nline "2"']);
      },
    },
    {
      name: "creates reusable JSON and CSV templates",
      fn: () => {
        const jsonTemplate = createCatalogImportTemplate("mini_grocery");
        const csvTemplate = createCatalogImportCsvTemplate("mini_grocery");

        assert.equal(jsonTemplate.length, 2);
        assert.equal(jsonTemplate[0]?.businessType, "mini_grocery");
        assert.match(csvTemplate, /^businessType,name,brand,/);
        assert.match(csvTemplate, /Premium Tea 250g/);
      },
    },
  ]);
}
