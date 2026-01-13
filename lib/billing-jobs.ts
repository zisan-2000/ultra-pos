import { prisma } from "@/lib/prisma";
import { BILLING_CONFIG, addDays, addMonths } from "@/lib/billing";

export type BillingDailyJobResult = {
  generatedInvoices: number;
  updatedSubscriptions: number;
  markedPastDue: number;
  activatedTrials: number;
};

export async function runBillingDailyJob(
  now: Date = new Date(),
): Promise<BillingDailyJobResult> {
  const result: BillingDailyJobResult = {
    generatedInvoices: 0,
    updatedSubscriptions: 0,
    markedPastDue: 0,
    activatedTrials: 0,
  };

  const trialUpdate = await prisma.shopSubscription.updateMany({
    where: { status: "trialing", trialEndsAt: { lte: now } },
    data: { status: "active" },
  });
  result.activatedTrials = trialUpdate.count;

  const dueSubscriptions = await prisma.shopSubscription.findMany({
    where: {
      status: { not: "canceled" },
      OR: [{ nextInvoiceAt: { lte: now } }, { nextInvoiceAt: null }],
    },
    include: {
      plan: { select: { amount: true, intervalMonths: true } },
      invoices: { orderBy: { periodEnd: "desc" }, take: 1 },
      shop: { select: { ownerId: true } },
    },
  });

  for (const subscription of dueSubscriptions) {
    const latestInvoice = subscription.invoices[0] ?? null;
    if (latestInvoice && latestInvoice.status !== "paid") continue;
    if (!subscription.plan) continue;

    const periodStart = latestInvoice
      ? latestInvoice.periodEnd
      : subscription.currentPeriodStart;
    const periodEnd = latestInvoice
      ? addMonths(periodStart, subscription.plan.intervalMonths)
      : subscription.currentPeriodEnd;

    const existing = await prisma.invoice.findFirst({
      where: {
        subscriptionId: subscription.id,
        periodStart,
        periodEnd,
      },
      select: { id: true },
    });

    const nextGraceEndsAt = addDays(periodEnd, BILLING_CONFIG.graceDays);
    const shouldActivate = subscription.status === "past_due";

    if (existing) {
      const updates: {
        currentPeriodStart?: Date;
        currentPeriodEnd?: Date;
        nextInvoiceAt?: Date;
        graceEndsAt?: Date;
        status?: "active";
      } = {};

      if (subscription.currentPeriodStart.getTime() !== periodStart.getTime()) {
        updates.currentPeriodStart = periodStart;
      }
      if (subscription.currentPeriodEnd.getTime() !== periodEnd.getTime()) {
        updates.currentPeriodEnd = periodEnd;
      }
      if (!subscription.nextInvoiceAt || subscription.nextInvoiceAt.getTime() !== periodEnd.getTime()) {
        updates.nextInvoiceAt = periodEnd;
      }
      if (!subscription.graceEndsAt || subscription.graceEndsAt.getTime() !== nextGraceEndsAt.getTime()) {
        updates.graceEndsAt = nextGraceEndsAt;
      }
      if (shouldActivate) {
        updates.status = "active";
      }

      if (Object.keys(updates).length > 0) {
        await prisma.shopSubscription.update({
          where: { id: subscription.id },
          data: updates,
        });
        result.updatedSubscriptions += 1;
      }
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.invoice.create({
        data: {
          subscriptionId: subscription.id,
          shopId: subscription.shopId,
          ownerId: subscription.shop.ownerId,
          periodStart,
          periodEnd,
          amount: subscription.plan.amount,
          status: "open",
          dueDate: periodEnd,
        },
      });

      await tx.shopSubscription.update({
        where: { id: subscription.id },
        data: {
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          nextInvoiceAt: periodEnd,
          graceEndsAt: nextGraceEndsAt,
          status: shouldActivate ? "active" : subscription.status,
        },
      });
    });

    result.generatedInvoices += 1;
    result.updatedSubscriptions += 1;
  }

  const graceCutoff = addDays(now, -BILLING_CONFIG.graceDays);
  const overdueInvoices = await prisma.invoice.findMany({
    where: {
      status: "open",
      dueDate: { lt: graceCutoff },
    },
    select: { subscriptionId: true },
  });

  if (overdueInvoices.length > 0) {
    const overdueSubscriptionIds = Array.from(
      new Set(overdueInvoices.map((invoice) => invoice.subscriptionId)),
    );
    const pastDueUpdate = await prisma.shopSubscription.updateMany({
      where: {
        id: { in: overdueSubscriptionIds },
        status: { not: "canceled" },
      },
      data: { status: "past_due" },
    });
    result.markedPastDue = pastDueUpdate.count;
  }

  return result;
}
