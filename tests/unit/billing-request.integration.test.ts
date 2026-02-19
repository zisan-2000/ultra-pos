import { runSuite } from "./test-utils.ts";
import {
  assertIntegrationScenarioShape,
  isIntegrationScenarioEnabled,
  logIntegrationScenarioSkip,
  type IntegrationScenario,
} from "./integration-test-utils.ts";

function buildBillingRequestScenarios(): IntegrationScenario[] {
  return [
    {
      id: "billing-request-submit",
      title: "owner submits payment request against open invoice",
      entrypoint: "submitPaymentRequest(FormData)",
      steps: [
        {
          phase: "arrange",
          description:
            "Seed owner, shop, open invoice, and active subscription for that owner.",
        },
        {
          phase: "act",
          description:
            "Call submitPaymentRequest with invoiceId, shopId, method, reference, and note.",
        },
        {
          phase: "assert",
          description:
            "Verify pending billing_payment_request exists and duplicate pending submission does not create another row.",
        },
      ],
    },
    {
      id: "billing-request-approve",
      title: "admin approval marks invoice paid and advances subscription state",
      entrypoint: "approvePaymentRequest(FormData)",
      steps: [
        {
          phase: "arrange",
          description:
            "Seed pending payment request linked to open invoice + subscription.",
        },
        {
          phase: "act",
          description: "Call approvePaymentRequest as admin/super-admin.",
        },
        {
          phase: "assert",
          description:
            "Verify request status=approved, invoice status=paid with paidAt, invoice_payment inserted, subscription status=active and nextInvoiceAt updated.",
        },
      ],
    },
    {
      id: "billing-request-reject",
      title: "admin rejection marks request rejected without paying invoice",
      entrypoint: "rejectPaymentRequest(FormData)",
      steps: [
        {
          phase: "arrange",
          description: "Seed pending payment request for an open invoice.",
        },
        {
          phase: "act",
          description: "Call rejectPaymentRequest as admin/super-admin.",
        },
        {
          phase: "assert",
          description:
            "Verify request status=rejected and invoice remains in open status.",
        },
      ],
    },
  ];
}

export async function runBillingRequestIntegrationScaffoldTests() {
  const suiteName = "integration scaffold: billing request";
  if (!isIntegrationScenarioEnabled()) {
    logIntegrationScenarioSkip(suiteName);
    return;
  }

  const scenarios = buildBillingRequestScenarios();
  await runSuite(suiteName, [
    {
      name: "defines billing request integration scenario contracts",
      fn: () => {
        for (const scenario of scenarios) {
          assertIntegrationScenarioShape(scenario);
        }
      },
    },
  ]);
}
