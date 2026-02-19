import { runSuite } from "./test-utils.ts";
import {
  assertIntegrationScenarioShape,
  isIntegrationScenarioEnabled,
  logIntegrationScenarioSkip,
  type IntegrationScenario,
} from "./integration-test-utils.ts";

function buildSalesScenarios(): IntegrationScenario[] {
  return [
    {
      id: "sales-cash-checkout",
      title: "cash sale creates sale rows, sale items, stock movement, and cash entry",
      entrypoint: "POST /api/sync/sales",
      steps: [
        {
          phase: "arrange",
          description:
            "Seed shop, staff user with create_sale permission, and two active products.",
        },
        {
          phase: "act",
          description:
            "Call /api/sync/sales with one new cash sale payload including multiple items.",
        },
        {
          phase: "assert",
          description:
            "Verify sale + sale_items persisted, stock reduced for trackStock products, and cash_entry IN created.",
        },
        {
          phase: "cleanup",
          description: "Delete seeded entities to keep test database isolated.",
        },
      ],
    },
    {
      id: "sales-due-flow",
      title: "due sale requires customer and writes customer ledger entries",
      entrypoint: "POST /api/sync/sales",
      steps: [
        {
          phase: "arrange",
          description:
            "Seed shop, staff user with create_sale + create_due_sale, and one customer.",
        },
        {
          phase: "act",
          description:
            "Submit due sale payload with paidNow partial amount and customerId.",
        },
        {
          phase: "assert",
          description:
            "Verify due customer is attached, customer_ledger has DUE + PAYMENT entries, and totals are consistent.",
        },
      ],
    },
  ];
}

export async function runSalesIntegrationScaffoldTests() {
  const suiteName = "integration scaffold: sales";
  if (!isIntegrationScenarioEnabled()) {
    logIntegrationScenarioSkip(suiteName);
    return;
  }

  const scenarios = buildSalesScenarios();
  await runSuite(suiteName, [
    {
      name: "defines sales integration scenario contracts",
      fn: () => {
        for (const scenario of scenarios) {
          assertIntegrationScenarioShape(scenario);
        }
      },
    },
  ]);
}
