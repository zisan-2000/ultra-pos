import { runSuite } from "./test-utils.ts";
import {
  assertIntegrationScenarioShape,
  isIntegrationScenarioEnabled,
  logIntegrationScenarioSkip,
  type IntegrationScenario,
} from "./integration-test-utils.ts";

function buildPurchaseScenarios(): IntegrationScenario[] {
  return [
    {
      id: "purchase-due-create",
      title: "due purchase creates purchase rows, supplier ledger, and updates stock cost",
      entrypoint: "POST /api/purchases",
      steps: [
        {
          phase: "arrange",
          description:
            "Seed shop, user with create_purchase permission, supplier, and products with starting stock/buyPrice.",
        },
        {
          phase: "act",
          description:
            "Call /api/purchases using paymentMethod=due and partial paidNow amount.",
        },
        {
          phase: "assert",
          description:
            "Verify purchase/purchase_items persisted, dueAmount computed, supplier_ledger updated, and weighted buyPrice recalculated.",
        },
        {
          phase: "cleanup",
          description: "Remove seeded records or rollback transaction sandbox.",
        },
      ],
    },
    {
      id: "purchase-due-payment",
      title: "recording payment against due purchase updates due balance and cash outflow",
      entrypoint: "POST /api/purchases/pay",
      steps: [
        {
          phase: "arrange",
          description:
            "Create an existing due purchase with non-zero dueAmount and supplier reference.",
        },
        {
          phase: "act",
          description:
            "Call /api/purchases/pay with amount <= dueAmount and a payment method.",
        },
        {
          phase: "assert",
          description:
            "Verify purchase paidAmount/dueAmount changes, purchase_payment row inserted, cash_entry OUT inserted, supplier ledger PAYMENT inserted.",
        },
      ],
    },
  ];
}

export async function runPurchasesIntegrationScaffoldTests() {
  const suiteName = "integration scaffold: purchases";
  if (!isIntegrationScenarioEnabled()) {
    logIntegrationScenarioSkip(suiteName);
    return;
  }

  const scenarios = buildPurchaseScenarios();
  await runSuite(suiteName, [
    {
      name: "defines purchases integration scenario contracts",
      fn: () => {
        for (const scenario of scenarios) {
          assertIntegrationScenarioShape(scenario);
        }
      },
    },
  ]);
}
