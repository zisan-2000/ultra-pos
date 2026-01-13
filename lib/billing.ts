import { InvoiceStatus, SubscriptionStatus } from "@prisma/client";

export const BILLING_CONFIG = {
  intervalMonths: 1,
  trialDays: 14,
  graceDays: 7,
};

export const DEFAULT_PLAN = {
  key: "starter_monthly",
  name: "Starter Monthly",
  amount: "499.00",
  intervalMonths: BILLING_CONFIG.intervalMonths,
};

export type BillingStatus =
  | "trialing"
  | "paid"
  | "due"
  | "past_due"
  | "canceled"
  | "untracked";

export type SubscriptionSnapshot = {
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  trialEndsAt: Date | null;
  graceEndsAt: Date | null;
};

export type InvoiceSnapshot = {
  status: InvoiceStatus;
  dueDate: Date;
  periodEnd: Date;
  paidAt: Date | null;
};

export type BillingCounts = {
  total: number;
  paid: number;
  due: number;
  pastDue: number;
  trialing: number;
  canceled: number;
  untracked: number;
};

export const addDays = (value: Date, days: number) => {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
};

export const addMonths = (value: Date, months: number) => {
  const next = new Date(value);
  next.setMonth(next.getMonth() + months);
  return next;
};

export function resolveBillingStatus(
  subscription?: SubscriptionSnapshot | null,
  invoice?: InvoiceSnapshot | null,
  now: Date = new Date(),
): BillingStatus {
  if (!subscription) return "untracked";
  if (subscription.status === "canceled") return "canceled";

  const nowTime = now.getTime();
  if (subscription.trialEndsAt && nowTime < subscription.trialEndsAt.getTime()) {
    return "trialing";
  }

  if (subscription.status === "past_due") return "past_due";

  if (invoice) {
    if (invoice.status === "paid") {
      if (invoice.periodEnd.getTime() >= nowTime) {
        return "paid";
      }
    } else {
      const graceEndsAt =
        subscription.graceEndsAt ?? addDays(invoice.dueDate, BILLING_CONFIG.graceDays);
      return nowTime > graceEndsAt.getTime() ? "past_due" : "due";
    }
  }

  if (subscription.currentPeriodEnd.getTime() >= nowTime) return "paid";
  return "past_due";
}

export function createEmptyBillingCounts(): BillingCounts {
  return {
    total: 0,
    paid: 0,
    due: 0,
    pastDue: 0,
    trialing: 0,
    canceled: 0,
    untracked: 0,
  };
}

export function addBillingStatus(
  counts: BillingCounts,
  status: BillingStatus,
): BillingCounts {
  counts.total += 1;
  if (status === "paid") counts.paid += 1;
  else if (status === "due") counts.due += 1;
  else if (status === "past_due") counts.pastDue += 1;
  else if (status === "trialing") counts.trialing += 1;
  else if (status === "canceled") counts.canceled += 1;
  else counts.untracked += 1;
  return counts;
}

export function buildOwnerBillingSummaries(
  shops: Array<{ id: string; ownerId: string }>,
  subscriptionByShopId: Map<string, SubscriptionSnapshot>,
  invoiceByShopId: Map<string, InvoiceSnapshot>,
  now: Date = new Date(),
): Map<string, BillingCounts> {
  const summaries = new Map<string, BillingCounts>();

  for (const shop of shops) {
    const status = resolveBillingStatus(
      subscriptionByShopId.get(shop.id),
      invoiceByShopId.get(shop.id),
      now,
    );

    const summary = summaries.get(shop.ownerId) ?? createEmptyBillingCounts();
    addBillingStatus(summary, status);
    summaries.set(shop.ownerId, summary);
  }

  return summaries;
}
