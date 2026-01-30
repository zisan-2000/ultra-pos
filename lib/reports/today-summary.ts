import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCogsTotal } from "@/app/actions/reports";
import { getDhakaDateOnlyRange, getDhakaDayRange } from "@/lib/dhaka-date";
import { assertShopAccess } from "@/lib/shop-access";
import type { UserContext } from "@/lib/rbac";
import { REPORTS_CACHE_TAGS } from "@/lib/reports/cache-tags";
import { SHOP_TYPES_WITH_COGS } from "@/lib/accounting/cogs";

export type TodaySummary = {
  sales: { total: number; count: number };
  expenses: { total: number; count: number; cogs: number };
  profit: number;
  cash: { in: number; out: number; balance: number; count: number };
};

async function computeTodaySummary(
  shopId: string,
  businessType?: string | null
): Promise<TodaySummary> {
  const { start: todayStart, end: todayEnd } = getDhakaDayRange();
  const { start: expenseStart, end: expenseEnd } = getDhakaDateOnlyRange();

  const [resolvedShopType, salesAgg, expenseAgg, cashAgg] = await Promise.all([
    businessType
      ? Promise.resolve(businessType)
      : prisma.shop
          .findUnique({
            where: { id: shopId },
            select: { businessType: true },
          })
          .then((shop) => shop?.businessType ?? null),
    prisma.sale.aggregate({
      where: {
        shopId,
        status: { not: "VOIDED" },
        saleDate: { gte: todayStart, lte: todayEnd },
      },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    prisma.expense.aggregate({
      where: { shopId, expenseDate: { gte: expenseStart, lte: expenseEnd } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.cashEntry.groupBy({
      by: ["entryType"],
      where: { shopId, createdAt: { gte: todayStart, lte: todayEnd } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const needsCogs = resolvedShopType
    ? SHOP_TYPES_WITH_COGS.has(resolvedShopType)
    : false;

  const salesTotal = Number(salesAgg._sum.totalAmount ?? 0);
  const salesCount = Number(salesAgg._count?._all ?? 0);

  const expenseTotalRaw = Number(expenseAgg._sum.amount ?? 0);
  const expenseCount = Number(expenseAgg._count?._all ?? 0);

  const cashTotals = cashAgg.reduce(
    (acc, row) => {
      const amount = Number(row._sum.amount ?? 0);
      const count = Number(row._count?._all ?? 0);
      if (row.entryType === "IN") {
        acc.in += amount;
        acc.count += count;
      } else if (row.entryType === "OUT") {
        acc.out += amount;
        acc.count += count;
      }
      return acc;
    },
    { in: 0, out: 0, count: 0 }
  );

  const cogsTotal = needsCogs
    ? await getCogsTotal(shopId, todayStart, todayEnd)
    : 0;

  const totalExpense = expenseTotalRaw;
  const balance = cashTotals.in - cashTotals.out;

  return {
    sales: {
      total: Number(salesTotal.toFixed(2)) || 0,
      count: salesCount,
    },
    expenses: {
      total: Number(totalExpense.toFixed(2)) || 0,
      count: expenseCount,
      cogs: Number(cogsTotal.toFixed(2)) || 0,
    },
    profit: Number((salesTotal - totalExpense - cogsTotal).toFixed(2)) || 0,
    cash: {
      in: Number(cashTotals.in.toFixed(2)) || 0,
      out: Number(cashTotals.out.toFixed(2)) || 0,
      balance: Number(balance.toFixed(2)) || 0,
      count: cashTotals.count,
    },
  };
}

const getTodaySummaryCached = unstable_cache(
  async (shopId: string, businessType?: string | null) =>
    computeTodaySummary(shopId, businessType),
  ["today-summary"],
  {
    revalidate: 30,
    tags: [REPORTS_CACHE_TAGS.todaySummary, REPORTS_CACHE_TAGS.summary],
  }
);

export async function getTodaySummaryForShop(
  shopId: string,
  user: UserContext
): Promise<TodaySummary> {
  const shop = await assertShopAccess(shopId, user);
  return getTodaySummaryCached(shopId, shop.businessType);
}
