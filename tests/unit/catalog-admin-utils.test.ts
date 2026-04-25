import assert from "node:assert/strict";
import {
  classifyCatalogBulkDeleteCandidates,
  computeCatalogNameSimilarityScore,
  formatCatalogProductRef,
  mergeCatalogMatchedBy,
} from "../../lib/catalog-admin-utils.ts";
import { runSuite } from "./test-utils.ts";

export async function runCatalogAdminUtilsTests() {
  await runSuite("catalog admin utils", [
    {
      name: "scores exact and fuzzy name matches with reasons",
      fn: () => {
        const exact = computeCatalogNameSimilarityScore("Fresh Milk", "Fresh Milk");
        const fuzzy = computeCatalogNameSimilarityScore("Fresh Milk 1L", "Fresh Milc 1L");

        assert.equal(exact.score, 6);
        assert.deepEqual(exact.reasons, ["same product name"]);
        assert.equal(fuzzy.score > 0, true);
        assert.equal(
          fuzzy.reasons.some((reason) => /fuzzy name match|shared prefix|shared name tokens/i.test(reason)),
          true,
        );
      },
    },
    {
      name: "merges match types into mixed when different signals are combined",
      fn: () => {
        assert.equal(mergeCatalogMatchedBy(null, "name"), "name");
        assert.equal(mergeCatalogMatchedBy("name", "name"), "name");
        assert.equal(mergeCatalogMatchedBy("name", "barcode"), "mixed");
      },
    },
    {
      name: "formats product references for audit messages",
      fn: () => {
        assert.equal(
          formatCatalogProductRef({
            id: "abc-123",
            name: "Milk",
            businessType: null,
          }),
          "Milk (global · abc-123)",
        );
      },
    },
    {
      name: "classifies bulk delete candidates into deletable, linked and protected groups",
      fn: () => {
        const result = classifyCatalogBulkDeleteCandidates([
          {
            id: "safe",
            templateCount: 0,
            productCount: 0,
            mergedChildCount: 0,
          },
          {
            id: "linked",
            templateCount: 1,
            productCount: 0,
            mergedChildCount: 0,
          },
          {
            id: "protected",
            templateCount: 0,
            productCount: 0,
            mergedChildCount: 2,
          },
        ]);

        assert.deepEqual(result.deletableIds, ["safe"]);
        assert.equal(result.linkedCount, 1);
        assert.equal(result.protectedCount, 1);
        assert.equal(result.skippedCount, 2);
      },
    },
  ]);
}
