import assert from "node:assert/strict";
import {
  BILLING_CONFIG,
  addDays,
  buildOwnerBillingSummaries,
  createEmptyBillingCounts,
  resolveBillingStatus,
  addBillingStatus,
} from "../../lib/billing.ts";
import { runSuite } from "./test-utils.ts";

export async function runBillingTests() {
  await runSuite("billing helpers", [
    {
      name: "returns untracked when subscription is missing",
      fn: () => {
    const status = resolveBillingStatus(null, null, new Date("2026-02-19T00:00:00Z"));
    assert.equal(status, "untracked");
      },
    },

    {
      name: "returns trialing when trial has not ended",
      fn: () => {
    const now = new Date("2026-02-19T00:00:00Z");
    const status = resolveBillingStatus(
      {
        status: "active",
        currentPeriodEnd: new Date("2026-03-01T00:00:00Z"),
        trialEndsAt: new Date("2026-02-25T00:00:00Z"),
        graceEndsAt: null,
      },
      null,
      now
    );
    assert.equal(status, "trialing");
      },
    },

    {
      name: "returns due when invoice is open but still within grace window",
      fn: () => {
    const dueDate = new Date("2026-02-10T00:00:00Z");
    const now = addDays(dueDate, BILLING_CONFIG.graceDays);

    const status = resolveBillingStatus(
      {
        status: "active",
        currentPeriodEnd: new Date("2026-03-01T00:00:00Z"),
        trialEndsAt: null,
        graceEndsAt: null,
      },
      {
        status: "open",
        dueDate,
        periodEnd: new Date("2026-03-01T00:00:00Z"),
        paidAt: null,
      },
      now
    );

    assert.equal(status, "due");
      },
    },

    {
      name: "returns past_due after grace window passes",
      fn: () => {
    const dueDate = new Date("2026-02-10T00:00:00Z");
    const now = addDays(dueDate, BILLING_CONFIG.graceDays + 1);

    const status = resolveBillingStatus(
      {
        status: "active",
        currentPeriodEnd: new Date("2026-03-01T00:00:00Z"),
        trialEndsAt: null,
        graceEndsAt: null,
      },
      {
        status: "open",
        dueDate,
        periodEnd: new Date("2026-03-01T00:00:00Z"),
        paidAt: null,
      },
      now
    );

    assert.equal(status, "past_due");
      },
    },

    {
      name: "aggregates owner billing counts by shop",
      fn: () => {
    const now = new Date("2026-02-19T00:00:00Z");
    const shops = [
      { id: "shop-a", ownerId: "owner-1" },
      { id: "shop-b", ownerId: "owner-1" },
      { id: "shop-c", ownerId: "owner-2" },
    ];

    const subscriptionByShopId = new Map([
      [
        "shop-a",
        {
          status: "active" as const,
          currentPeriodEnd: new Date("2026-03-01T00:00:00Z"),
          trialEndsAt: null,
          graceEndsAt: null,
        },
      ],
      [
        "shop-b",
        {
          status: "past_due" as const,
          currentPeriodEnd: new Date("2026-02-01T00:00:00Z"),
          trialEndsAt: null,
          graceEndsAt: null,
        },
      ],
    ]);

    const invoiceByShopId = new Map([
      [
        "shop-a",
        {
          status: "paid" as const,
          dueDate: new Date("2026-02-01T00:00:00Z"),
          periodEnd: new Date("2026-03-01T00:00:00Z"),
          paidAt: new Date("2026-02-01T10:00:00Z"),
        },
      ],
      [
        "shop-b",
        {
          status: "open" as const,
          dueDate: new Date("2026-02-01T00:00:00Z"),
          periodEnd: new Date("2026-03-01T00:00:00Z"),
          paidAt: null,
        },
      ],
    ]);

    const summaries = buildOwnerBillingSummaries(
      shops,
      subscriptionByShopId,
      invoiceByShopId,
      now
    );

    assert.deepEqual(summaries.get("owner-1"), {
      total: 2,
      paid: 1,
      due: 0,
      pastDue: 1,
      trialing: 0,
      canceled: 0,
      untracked: 0,
    });
    assert.deepEqual(summaries.get("owner-2"), {
      total: 1,
      paid: 0,
      due: 0,
      pastDue: 0,
      trialing: 0,
      canceled: 0,
      untracked: 1,
    });
      },
    },

    {
      name: "increments count buckets correctly",
      fn: () => {
    const counts = createEmptyBillingCounts();
    addBillingStatus(counts, "paid");
    addBillingStatus(counts, "due");
    addBillingStatus(counts, "past_due");
    addBillingStatus(counts, "trialing");
    addBillingStatus(counts, "canceled");
    addBillingStatus(counts, "untracked");

    assert.deepEqual(counts, {
      total: 6,
      paid: 1,
      due: 1,
      pastDue: 1,
      trialing: 1,
      canceled: 1,
      untracked: 1,
    });
      },
    },
  ]);
}
