import { runBillingTests } from "./billing.test.ts";
import { runBillingRequestIntegrationScaffoldTests } from "./billing-request.integration.test.ts";
import { runCsvUtilTests } from "./csv.test.ts";
import { runDateRangeTests } from "./date-range.test.ts";
import { runDebounceTests } from "./debounce.test.ts";
import { runPurchasesIntegrationScaffoldTests } from "./purchases.integration.test.ts";
import { runQueueWorkflowTests } from "./queue-workflow.test.ts";
import { runReportingRangeTests } from "./reporting-range.test.ts";
import { runReportingConfigTests } from "./reporting-config.test.ts";
import { runSalesIntegrationScaffoldTests } from "./sales.integration.test.ts";
import { runStockLevelTests } from "./stock-level.test.ts";

async function main() {
  const suites = [
    runBillingTests,
    runCsvUtilTests,
    runDateRangeTests,
    runDebounceTests,
    runQueueWorkflowTests,
    runReportingConfigTests,
    runReportingRangeTests,
    runStockLevelTests,
    runSalesIntegrationScaffoldTests,
    runPurchasesIntegrationScaffoldTests,
    runBillingRequestIntegrationScaffoldTests,
  ];
  let failedSuites = 0;

  for (const suite of suites) {
    try {
      await suite();
    } catch {
      failedSuites += 1;
    }
  }

  if (failedSuites > 0) {
    console.error(`\nUnit test run failed: ${failedSuites} suite(s) failed.`);
    process.exit(1);
  }

  console.log("\nAll unit tests passed.");
}

main().catch((error) => {
  console.error("\nUnexpected test runner error.");
  console.error(error);
  process.exit(1);
});
