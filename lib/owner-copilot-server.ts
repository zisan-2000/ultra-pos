import { getPayablesSummary } from "@/app/actions/purchases";
import { resolveBillingStatus } from "@/lib/billing";
import { SHOP_TYPES_WITH_COGS } from "@/lib/accounting/cogs";
import {
  getDhakaDateOnlyRange,
  getDhakaDateString,
  parseDhakaDateOnlyRange,
} from "@/lib/dhaka-date";
import { getBusinessTypeLabel, type OwnerCopilotSnapshot } from "@/lib/owner-copilot";
import { prisma } from "@/lib/prisma";
import { getCogsTotalRaw } from "@/lib/reports/cogs";
import { getTodaySummaryForShop, type TodaySummary } from "@/lib/reports/today-summary";
import { assertShopAccess } from "@/lib/shop-access";
import type { UserContext } from "@/lib/rbac";

type RangeSummary = {
  sales: number;
  profit: number;
  expenses: number;
  cashBalance: number;
};

type OwnerCopilotServerPayload = {
  summary: TodaySummary;
  payables: {
    totalDue: number;
    dueCount: number;
    supplierCount: number;
  };
  snapshot: OwnerCopilotSnapshot;
};

async function computeSummaryForRange(
  shopId: string,
  from: string,
  to: string,
  businessType?: string | null
): Promise<RangeSummary> {
  const { start, end } = parseDhakaDateOnlyRange(from, to, true);
  const [salesAgg, saleReturnAgg, expenseAgg, cashAgg] = await Promise.all([
    prisma.sale.aggregate({
      where: {
        shopId,
        status: { not: "VOIDED" },
        businessDate: { gte: start, lte: end },
      },
      _sum: { totalAmount: true },
    }),
    prisma.saleReturn.aggregate({
      where: {
        shopId,
        status: "completed",
        businessDate: { gte: start, lte: end },
      },
      _sum: { netAmount: true },
    }),
    prisma.expense.aggregate({
      where: {
        shopId,
        expenseDate: { gte: start, lte: end },
      },
      _sum: { amount: true },
    }),
    prisma.cashEntry.groupBy({
      by: ["entryType"],
      where: {
        shopId,
        businessDate: { gte: start, lte: end },
      },
      _sum: { amount: true },
    }),
  ]);

  const sales =
    Number(salesAgg._sum.totalAmount ?? 0) + Number(saleReturnAgg._sum.netAmount ?? 0);
  const rawExpenses = Number(expenseAgg._sum.amount ?? 0);
  const cogs =
    businessType && SHOP_TYPES_WITH_COGS.has(businessType)
      ? await getCogsTotalRaw(shopId, start, end)
      : 0;
  const cashIn = cashAgg
    .filter((row) => row.entryType === "IN")
    .reduce((sum, row) => sum + Number(row._sum.amount ?? 0), 0);
  const cashOut = cashAgg
    .filter((row) => row.entryType === "OUT")
    .reduce((sum, row) => sum + Number(row._sum.amount ?? 0), 0);
  const expenses = rawExpenses + cogs;

  return {
    sales: Number(sales.toFixed(2)),
    expenses: Number(expenses.toFixed(2)),
    profit: Number((sales - expenses).toFixed(2)),
    cashBalance: Number((cashIn - cashOut).toFixed(2)),
  };
}

async function buildOwnerCopilotSnapshot(shopId: string) {
  const { start: todayStart, end: todayEnd } = getDhakaDateOnlyRange();
  const yesterdayKey = getDhakaDateString(
    new Date(Date.now() - 24 * 60 * 60 * 1000)
  );
  const trailingStartKey = getDhakaDateString(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  );

  const [
    shopMeta,
    lowStockCount,
    lowestStockItem,
    dueAgg,
    topDueCustomer,
    queuePendingCount,
    topProductRows,
    topExpenseCategory,
  ] = await Promise.all([
    prisma.shop.findUnique({
      where: { id: shopId },
      select: {
        name: true,
        businessType: true,
        queueTokenEnabled: true,
      },
    }),
    prisma.product.count({
      where: {
        shopId,
        isActive: true,
        trackStock: true,
        stockQty: { lte: 10 },
      },
    }),
    prisma.product.findFirst({
      where: {
        shopId,
        isActive: true,
        trackStock: true,
        stockQty: { lte: 10 },
      },
      orderBy: { stockQty: "asc" },
      select: { name: true, stockQty: true },
    }),
    prisma.customer.aggregate({
      where: { shopId, totalDue: { gt: 0 } },
      _sum: { totalDue: true },
      _count: { _all: true },
    }),
    prisma.customer.findFirst({
      where: { shopId, totalDue: { gt: 0 } },
      orderBy: { totalDue: "desc" },
      select: { name: true, totalDue: true },
    }),
    prisma.queueToken.count({
      where: {
        shopId,
        businessDate: { gte: todayStart, lte: todayEnd },
        status: { in: ["WAITING", "CALLED", "IN_PROGRESS", "READY"] },
      },
    }),
    prisma.saleItem.groupBy({
      by: ["productId"],
      where: {
        sale: {
          shopId,
          status: { not: "VOIDED" },
          businessDate: { gte: todayStart, lte: todayEnd },
        },
      },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { lineTotal: "desc" } },
      take: 1,
    }),
    prisma.expense.groupBy({
      by: ["category"],
      where: {
        shopId,
        expenseDate: { gte: todayStart, lte: todayEnd },
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 1,
    }),
  ]);

  const topProductId = topProductRows[0]?.productId ?? null;
  const topProduct = topProductId
    ? await prisma.product.findUnique({
        where: { id: topProductId },
        select: { name: true },
      })
    : null;

  const businessType = shopMeta?.businessType ?? null;
  const [yesterdaySummary, trailingSummary] = await Promise.all([
    computeSummaryForRange(shopId, yesterdayKey, yesterdayKey, businessType),
    computeSummaryForRange(shopId, trailingStartKey, yesterdayKey, businessType),
  ]);

  return {
    businessType,
    shopName: shopMeta?.name ?? "আপনার দোকান",
    businessLabel: getBusinessTypeLabel(businessType),
    topProductName: topProduct?.name ?? null,
    topProductQty: Number(topProductRows[0]?._sum.quantity ?? 0),
    topProductRevenue: Number(topProductRows[0]?._sum.lineTotal ?? 0),
    lowStockCount: Number(lowStockCount ?? 0),
    lowestStockName: lowestStockItem?.name ?? null,
    lowestStockQty:
      lowestStockItem?.stockQty !== undefined && lowestStockItem?.stockQty !== null
        ? Number(lowestStockItem.stockQty)
        : null,
    dueTotal: Number(dueAgg._sum.totalDue ?? 0),
    dueCustomerCount: Number(dueAgg._count._all ?? 0),
    topDueCustomerName: topDueCustomer?.name ?? null,
    topDueCustomerAmount: Number(topDueCustomer?.totalDue ?? 0),
    queuePendingCount: shopMeta?.queueTokenEnabled ? Number(queuePendingCount) : 0,
    yesterday: yesterdaySummary,
    average7d: {
      sales: Number((trailingSummary.sales / 7).toFixed(2)),
      expenses: Number((trailingSummary.expenses / 7).toFixed(2)),
      profit: Number((trailingSummary.profit / 7).toFixed(2)),
      cashBalance: Number((trailingSummary.cashBalance / 7).toFixed(2)),
    },
    topExpenseCategoryName: topExpenseCategory[0]?.category ?? null,
    topExpenseCategoryAmount: Number(topExpenseCategory[0]?._sum.amount ?? 0),
  };
}

export async function getOwnerCopilotPayload(
  shopId: string,
  user: UserContext
): Promise<OwnerCopilotServerPayload> {
  await assertShopAccess(shopId, user);

  const [summary, payables, baseSnapshot, subscription, invoice] = await Promise.all([
    getTodaySummaryForShop(shopId, user),
    getPayablesSummary(shopId).catch(() => ({
      totalDue: 0,
      dueCount: 0,
      supplierCount: 0,
    })),
    buildOwnerCopilotSnapshot(shopId),
    prisma.shopSubscription.findUnique({
      where: { shopId },
      select: {
        status: true,
        currentPeriodEnd: true,
        trialEndsAt: true,
        graceEndsAt: true,
      },
    }),
    prisma.invoice.findFirst({
      where: { shopId },
      select: {
        status: true,
        dueDate: true,
        periodEnd: true,
        paidAt: true,
      },
      orderBy: { periodEnd: "desc" },
    }),
  ]);

  const billingStatus = resolveBillingStatus(
    subscription
      ? {
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd,
          trialEndsAt: subscription.trialEndsAt,
          graceEndsAt: subscription.graceEndsAt,
        }
      : null,
    invoice
      ? {
          status: invoice.status,
          dueDate: invoice.dueDate,
          periodEnd: invoice.periodEnd,
          paidAt: invoice.paidAt,
        }
      : null
  );

  return {
    summary,
    payables,
    snapshot: {
      ...baseSnapshot,
      payablesTotal: payables.totalDue,
      payableCount: payables.dueCount,
      payableSupplierCount: payables.supplierCount,
      billingStatus,
    },
  };
}
