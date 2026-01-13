// prisma/seed/billing/seedBilling.ts

import { PrismaClient } from "@prisma/client";
import type { ShopMap } from "../utils";

const DEFAULT_PLAN = {
  key: "starter_monthly",
  name: "Starter Monthly",
  amount: "499.00",
  intervalMonths: 1,
};

const TRIAL_DAYS = 14;
const GRACE_DAYS = 7;

const addDays = (value: Date, days: number) => {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
};

const addMonths = (value: Date, months: number) => {
  const next = new Date(value);
  next.setMonth(next.getMonth() + months);
  return next;
};

export async function seedBilling(
  prisma: PrismaClient,
  shops: ShopMap,
) {
  const plan = await prisma.subscriptionPlan.upsert({
    where: { key: DEFAULT_PLAN.key },
    update: {},
    create: {
      key: DEFAULT_PLAN.key,
      name: DEFAULT_PLAN.name,
      amount: DEFAULT_PLAN.amount,
      intervalMonths: DEFAULT_PLAN.intervalMonths,
      isActive: true,
    },
  });

  const now = new Date();
  const periodStart = now;
  const periodEnd = addMonths(periodStart, plan.intervalMonths);
  const trialEndsAt = addDays(periodStart, TRIAL_DAYS);
  const graceEndsAt = addDays(periodEnd, GRACE_DAYS);

  for (const shop of Object.values(shops)) {
    const existing = await prisma.shopSubscription.findUnique({
      where: { shopId: shop.id },
      select: { id: true },
    });

    if (existing) continue;

    const subscription = await prisma.shopSubscription.create({
      data: {
        shopId: shop.id,
        ownerId: shop.ownerId,
        planId: plan.id,
        status: "trialing",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        nextInvoiceAt: periodEnd,
        trialEndsAt,
        graceEndsAt,
      },
    });

    await prisma.invoice.create({
      data: {
        subscriptionId: subscription.id,
        shopId: shop.id,
        ownerId: shop.ownerId,
        periodStart,
        periodEnd,
        amount: plan.amount,
        status: "open",
        dueDate: periodEnd,
      },
    });
  }

  return plan;
}
