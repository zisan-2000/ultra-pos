// app/actions/reports.ts

"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { REPORT_ROW_LIMIT, clampReportLimit } from "@/lib/reporting-config";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";
import { unstable_cache } from "next/cache";
import { REPORTS_CACHE_TAGS } from "@/lib/reports/cache-tags";
import { shopNeedsCogs } from "@/lib/accounting/cogs";
import { getCogsTotalRaw } from "@/lib/reports/cogs";
import { parseDhakaDateRange, parseUtcDateRange } from "@/lib/date-range";
import { hasPermission, type UserContext } from "@/lib/rbac";

function ensureBoundedRange(
  start?: Date | null,
  end?: Date | null,
  fallbackDays = 30
) {
  const endDate = end ? new Date(end) : new Date();
  const startDate = start
    ? new Date(start)
    : new Date(endDate.getTime() - fallbackDays * 24 * 60 * 60 * 1000);

  return { start: startDate, end: endDate };
}

function clampRange(start?: Date | null, end?: Date | null, maxDays = 90) {
  const bounded = ensureBoundedRange(start, end, maxDays);
  const maxWindowMs = maxDays * 24 * 60 * 60 * 1000;
  const delta = bounded.end.getTime() - bounded.start.getTime();
  if (delta > maxWindowMs) {
    const clampedStart = new Date(bounded.end.getTime() - maxWindowMs);
    return { start: clampedStart, end: bounded.end };
  }
  return bounded;
}

function sumCogs(rows: { qty: any; buyPrice: any }[]) {
  return rows.reduce((sum, r) => {
    const qty = Number(r.qty ?? 0);
    const buy = Number(r.buyPrice ?? 0);
    if (!Number.isFinite(qty) || !Number.isFinite(buy)) return sum;
    return sum + qty * buy;
  }, 0);
}

function ensureReportPermission(user: UserContext, permission: string) {
  if (hasPermission(user, permission) || hasPermission(user, "view_reports")) {
    return;
  }
  throw new Error("Forbidden: missing permission " + permission);
}

export async function getCogsTotal(
  shopId: string,
  from?: Date | null,
  to?: Date | null
) {
  const user = await requireUser();
  ensureReportPermission(user, "view_profit_report");
  await assertShopAccess(shopId, user);
  return getCogsTotalRaw(shopId, from, to);
}

export async function getCogsByDay(
  shopId: string,
  from?: Date | null,
  to?: Date | null
) {
  const user = await requireUser();
  ensureReportPermission(user, "view_profit_report");
  await assertShopAccess(shopId, user);

  const { start, end } = ensureBoundedRange(from, to);

  const rows = await prisma.$queryRaw<
    { day: Date; sum: Prisma.Decimal | number | null }[]
  >(Prisma.sql`
    SELECT
      DATE(s.sale_date) AS day,
      SUM(CAST(si.quantity AS numeric) * COALESCE(si.cost_at_sale, p.buy_price, 0)) AS sum
    FROM "sale_items" si
    JOIN "sales" s ON s.id = si.sale_id
    JOIN "products" p ON p.id = si.product_id
    WHERE s.shop_id = CAST(${shopId} AS uuid)
      AND s.status <> 'VOIDED'
      AND s.sale_date >= ${start}
      AND s.sale_date <= ${end}
    GROUP BY DATE(s.sale_date)
    ORDER BY DATE(s.sale_date)
  `);

  const byDay: Record<string, number> = {};
  rows.forEach((r) => {
    const day = new Date(r.day).toISOString().split("T")[0];
    byDay[day] = Number(r.sum ?? 0);
  });
  return byDay;
}

const parseTimestampRange = (from?: string, to?: string) =>
  parseDhakaDateRange(from, to, false);

const parseDateRange = (from?: string, to?: string) =>
  parseUtcDateRange(from, to, true);

function normalizeLimit(
  limit?: number | null,
  defaultLimit = REPORT_ROW_LIMIT
) {
  const n = Number(limit);
  if (!Number.isFinite(n)) return defaultLimit;
  return Math.max(1, Math.min(n, REPORT_ROW_LIMIT));
}

export type ReportCursor = {
  at: string;
  id: string;
};

type ReportPaginationInput = {
  shopId: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: { at: Date; id: string } | null;
};

/* --------------------------------------------------
   SALES LIST WITH DATE FILTER
-------------------------------------------------- */
export async function getSalesWithFilterPaginated({
  shopId,
  from,
  to,
  limit,
  cursor,
}: ReportPaginationInput) {
  const user = await requireUser();
  ensureReportPermission(user, "view_sales_report");
  await assertShopAccess(shopId, user);
  const safeLimit = normalizeLimit(limit);
  const parsed = parseTimestampRange(from, to);
  const useUnbounded = !from && !to;
  const { start, end } = useUnbounded
    ? { start: undefined, end: undefined }
    : clampRange(parsed.start, parsed.end, 90);

  const where: Prisma.SaleWhereInput = {
    shopId,
    status: { not: "VOIDED" },
    saleDate: {
      gte: start ?? undefined,
      lte: end ?? undefined,
    },
  };

  if (cursor) {
    where.AND = [
      {
        OR: [
          { saleDate: { lt: cursor.at } },
          { saleDate: cursor.at, id: { lt: cursor.id } },
        ],
      },
    ];
  }

  const rows = await prisma.sale.findMany({
    where,
    select: {
      id: true,
      saleDate: true,
      totalAmount: true,
      paymentMethod: true,
      note: true,
    },
    orderBy: [{ saleDate: "desc" }, { id: "desc" }],
    take: safeLimit + 1,
  });

  const hasMore = rows.length > safeLimit;
  const pageRows = rows.slice(0, safeLimit);
  const last = pageRows[pageRows.length - 1];
  const nextCursor: ReportCursor | null =
    hasMore && last ? { at: last.saleDate.toISOString(), id: last.id } : null;

  return { rows: pageRows, nextCursor, hasMore };
}

export async function getSalesWithFilter(
  shopId: string,
  from?: string,
  to?: string,
  limit?: number
) {
  const { rows } = await getSalesWithFilterPaginated({
    shopId,
    from,
    to,
    limit,
  });
  return rows;
}

/* --------------------------------------------------
   EXPENSE LIST WITH DATE FILTER
-------------------------------------------------- */
export async function getExpensesWithFilterPaginated({
  shopId,
  from,
  to,
  limit,
  cursor,
}: ReportPaginationInput) {
  const user = await requireUser();
  ensureReportPermission(user, "view_expense_report");
  await assertShopAccess(shopId, user);
  const safeLimit = normalizeLimit(limit);
  const parsed = parseDateRange(from, to);
  const useUnbounded = !from && !to;
  const { start, end } = useUnbounded
    ? { start: undefined, end: undefined }
    : clampRange(parsed.start, parsed.end, 90);

  const where: Prisma.ExpenseWhereInput = {
    shopId,
    expenseDate: {
      gte: start ?? undefined,
      lte: end ?? undefined,
    },
  };

  if (cursor) {
    where.AND = [
      {
        OR: [
          { expenseDate: { lt: cursor.at } },
          { expenseDate: cursor.at, id: { lt: cursor.id } },
        ],
      },
    ];
  }

  const rows = await prisma.expense.findMany({
    where,
    select: {
      id: true,
      expenseDate: true,
      amount: true,
      category: true,
    },
    orderBy: [{ expenseDate: "desc" }, { id: "desc" }],
    take: safeLimit + 1,
  });

  const hasMore = rows.length > safeLimit;
  const pageRows = rows.slice(0, safeLimit);
  const last = pageRows[pageRows.length - 1];
  const nextCursor: ReportCursor | null =
    hasMore && last
      ? { at: last.expenseDate.toISOString(), id: last.id }
      : null;

  return { rows: pageRows, nextCursor, hasMore };
}

export async function getExpensesWithFilter(
  shopId: string,
  from?: string,
  to?: string,
  limit?: number
) {
  const { rows } = await getExpensesWithFilterPaginated({
    shopId,
    from,
    to,
    limit,
  });
  return rows;
}

/* --------------------------------------------------
   CASHBOOK LIST WITH DATE FILTER
-------------------------------------------------- */
export async function getCashWithFilterPaginated({
  shopId,
  from,
  to,
  limit,
  cursor,
}: ReportPaginationInput) {
  const user = await requireUser();
  ensureReportPermission(user, "view_cashbook_report");
  await assertShopAccess(shopId, user);
  const safeLimit = normalizeLimit(limit);
  const parsed = parseTimestampRange(from, to);
  const useUnbounded = !from && !to;
  const { start, end } = useUnbounded
    ? { start: undefined, end: undefined }
    : clampRange(parsed.start, parsed.end, 90);

  const where: Prisma.CashEntryWhereInput = {
    shopId,
    createdAt: {
      gte: start ?? undefined,
      lte: end ?? undefined,
    },
  };

  if (cursor) {
    where.AND = [
      {
        OR: [
          { createdAt: { lt: cursor.at } },
          { createdAt: cursor.at, id: { lt: cursor.id } },
        ],
      },
    ];
  }

  const rows = await prisma.cashEntry.findMany({
    where,
    select: {
      id: true,
      entryType: true,
      amount: true,
      reason: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: safeLimit + 1,
  });

  const hasMore = rows.length > safeLimit;
  const pageRows = rows.slice(0, safeLimit);
  const last = pageRows[pageRows.length - 1];
  const nextCursor: ReportCursor | null =
    hasMore && last ? { at: last.createdAt.toISOString(), id: last.id } : null;

  return { rows: pageRows, nextCursor, hasMore };
}

export async function getCashWithFilter(
  shopId: string,
  from?: string,
  to?: string,
  limit?: number
) {
  const { rows } = await getCashWithFilterPaginated({
    shopId,
    from,
    to,
    limit,
  });
  return rows;
}

/* --------------------------------------------------
   SALES SUMMARY (DATE AWARE)
-------------------------------------------------- */
async function computeSalesSummary(
  shopId: string,
  from?: string,
  to?: string
) {
  const parsed = parseTimestampRange(from, to);
  const useUnbounded = !from && !to;
  const { start, end } = useUnbounded
    ? { start: undefined, end: undefined }
    : clampRange(parsed.start, parsed.end, 90);
  const where: Prisma.SaleWhereInput = {
    shopId,
    status: { not: "VOIDED" },
    saleDate: {
      gte: start ?? undefined,
      lte: end ?? undefined,
    },
  };

  const [agg, voided] = await Promise.all([
    prisma.sale.aggregate({
      where,
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    prisma.sale.count({
      where: {
        shopId,
        status: "VOIDED",
        saleDate: {
          gte: start ?? undefined,
          lte: end ?? undefined,
        },
      },
    }),
  ]);

  const totalAmount = Number(agg._sum.totalAmount ?? 0);
  const completedCount = agg._count._all ?? 0;
  const voidedCount = voided ?? 0;

  return {
    totalAmount,
    count: completedCount,
    completedCount,
    voidedCount,
  };
}

const getSalesSummaryCached = unstable_cache(
  async (shopId: string, from?: string, to?: string) =>
    computeSalesSummary(shopId, from, to),
  ["reports-sales-summary"],
  {
    revalidate: 30,
    tags: [REPORTS_CACHE_TAGS.salesSummary, REPORTS_CACHE_TAGS.summary],
  }
);

export async function getSalesSummary(
  shopId: string,
  from?: string,
  to?: string
) {
  const user = await requireUser();
  ensureReportPermission(user, "view_sales_report");
  await assertShopAccess(shopId, user);
  return getSalesSummaryCached(shopId, from, to);
}
export async function getSalesSummaryFresh(
  shopId: string,
  from?: string,
  to?: string
) {
  const user = await requireUser();
  ensureReportPermission(user, "view_sales_report");
  await assertShopAccess(shopId, user);
  return computeSalesSummary(shopId, from, to);
}
export async function getExpenseSummary(
  shopId: string,
  from?: string,
  to?: string
) {
  const user = await requireUser();
  ensureReportPermission(user, "view_expense_report");
  await assertShopAccess(shopId, user);
  return getExpenseSummaryCached(shopId, from, to);
}
export async function getExpenseSummaryFresh(
  shopId: string,
  from?: string,
  to?: string
) {
  const user = await requireUser();
  ensureReportPermission(user, "view_expense_report");
  await assertShopAccess(shopId, user);
  return computeExpenseSummary(shopId, from, to);
}
export async function getCashSummary(
  shopId: string,
  from?: string,
  to?: string
) {
  const user = await requireUser();
  ensureReportPermission(user, "view_cashbook_report");
  await assertShopAccess(shopId, user);
  return getCashSummaryCached(shopId, from, to);
}
export async function getCashSummaryFresh(
  shopId: string,
  from?: string,
  to?: string
) {
  const user = await requireUser();
  ensureReportPermission(user, "view_cashbook_report");
  await assertShopAccess(shopId, user);
  return computeCashSummary(shopId, from, to);
}
export async function getProfitSummary(
  shopId: string,
  from?: string,
  to?: string
) {
  const user = await requireUser();
  ensureReportPermission(user, "view_profit_report");
  await assertShopAccess(shopId, user);
  return getProfitSummaryCached(shopId, from, to);
}
export async function getProfitSummaryFresh(
  shopId: string,
  from?: string,
  to?: string
) {
  const user = await requireUser();
  ensureReportPermission(user, "view_profit_report");
  await assertShopAccess(shopId, user);
  return computeProfitSummary(shopId, from, to);
}

async function computeExpenseSummary(
  shopId: string,
  from?: string,
  to?: string
) {
  const parsed = parseDateRange(from, to);
  const useUnbounded = !from && !to;
  const { start, end } = useUnbounded
    ? { start: undefined, end: undefined }
    : clampRange(parsed.start, parsed.end, 90);
  const agg = await prisma.expense.aggregate({
    where: {
      shopId,
      expenseDate: {
        gte: start ?? undefined,
        lte: end ?? undefined,
      },
    },
    _sum: { amount: true },
    _count: { _all: true },
  });

  const totalAmount = Number(agg._sum.amount ?? 0);

  return {
    totalAmount,
    count: agg._count._all ?? 0,
  };
}

const getExpenseSummaryCached = unstable_cache(
  async (shopId: string, from?: string, to?: string) =>
    computeExpenseSummary(shopId, from, to),
  ["reports-expense-summary"],
  {
    revalidate: 30,
    tags: [REPORTS_CACHE_TAGS.expenseSummary, REPORTS_CACHE_TAGS.summary],
  }
);

async function computeCashSummary(
  shopId: string,
  from?: string,
  to?: string
) {
  const parsed = parseTimestampRange(from, to);
  const useUnbounded = !from && !to;
  const { start, end } = useUnbounded
    ? { start: undefined, end: undefined }
    : clampRange(parsed.start, parsed.end, 90);
  const grouped = await prisma.cashEntry.groupBy({
    by: ["entryType"],
    where: {
      shopId,
      createdAt: {
        gte: start ?? undefined,
        lte: end ?? undefined,
      },
    },
    _sum: { amount: true },
  });

  const totals = grouped.reduce(
    (acc, row) => {
      const amount = Number(row._sum.amount ?? 0);
      if (row.entryType === "IN") acc.in += amount;
      else acc.out += amount;
      return acc;
    },
    { in: 0, out: 0 }
  );

  return {
    totalIn: totals.in,
    totalOut: totals.out,
    balance: totals.in - totals.out,
  };
}

const getCashSummaryCached = unstable_cache(
  async (shopId: string, from?: string, to?: string) =>
    computeCashSummary(shopId, from, to),
  ["reports-cash-summary"],
  {
    revalidate: 30,
    tags: [REPORTS_CACHE_TAGS.cashSummary, REPORTS_CACHE_TAGS.summary],
  }
);

async function computeProfitSummary(
  shopId: string,
  from?: string,
  to?: string
) {
  const { start, end } = parseTimestampRange(from, to);
  const fallbackDays = !from && !to ? 3650 : 30;
  const bounded = ensureBoundedRange(start, end, fallbackDays);

  const rangeFrom = bounded.start.toISOString();
  const rangeTo = bounded.end.toISOString();

  // Fetch shop type and sales/expense data in parallel (not sequential)
  const [salesData, expenseData, needsCogs] = await Promise.all([
    computeSalesSummary(shopId, rangeFrom, rangeTo),
    computeExpenseSummary(shopId, rangeFrom, rangeTo),
    shopNeedsCogs(shopId),
  ]);

  // Only fetch COGS if needed
  const cogs = needsCogs
    ? await getCogsTotalRaw(shopId, bounded.start, bounded.end)
    : 0;

  const totalExpense = expenseData.totalAmount + cogs;
  const profit = salesData.totalAmount - totalExpense;

  return {
    salesTotal: salesData.totalAmount,
    expenseTotal: totalExpense,
    profit,
    cogs,
  };
}

const getProfitSummaryCached = unstable_cache(
  async (shopId: string, from?: string, to?: string) =>
    computeProfitSummary(shopId, from, to),
  ["reports-profit-summary"],
  {
    revalidate: 30,
    tags: [REPORTS_CACHE_TAGS.profitSummary, REPORTS_CACHE_TAGS.summary],
  }
);

/* --------------------------------------------------
   PAYMENT METHOD REPORT
-------------------------------------------------- */
async function computePaymentMethodReport(
  shopId: string,
  from?: string,
  to?: string
) {
  const { start, end } = parseTimestampRange(from, to);
  const useUnbounded = !from && !to;

  const sales = await prisma.sale.groupBy({
    by: ["paymentMethod"],
    where: {
      shopId,
      status: { not: "VOIDED" },
      saleDate: useUnbounded
        ? undefined
        : {
            gte: start,
            lte: end,
          },
    },
    _sum: {
      totalAmount: true,
    },
    _count: {
      id: true,
    },
  });

  return sales.map((s) => ({
    name: s.paymentMethod || "Unknown",
    value: Number(s._sum.totalAmount || 0),
    count: s._count.id,
  }));
}

const getPaymentMethodCached = unstable_cache(
  async (shopId: string, from?: string, to?: string) =>
    computePaymentMethodReport(shopId, from, to),
  ["reports-payment-method"],
  { revalidate: 60, tags: [REPORTS_CACHE_TAGS.paymentMethod] }
);

export async function getPaymentMethodReport(
  shopId: string,
  from?: string,
  to?: string
) {
  const user = await requireUser();
  ensureReportPermission(user, "view_payment_method_report");
  await assertShopAccess(shopId, user);
  return getPaymentMethodCached(shopId, from, to);
}

/* --------------------------------------------------
   PROFIT TREND REPORT
-------------------------------------------------- */
async function computeProfitTrendReport(
  shopId: string,
  from?: string,
  to?: string
) {
  const { start, end } = parseTimestampRange(from, to);
  const useUnbounded = !from && !to;
  const needsCogs = await shopNeedsCogs(shopId);

  const salesWhere: Prisma.Sql[] = [
    Prisma.sql` s.shop_id = CAST(${shopId} AS uuid)`,
    Prisma.sql` s.status <> 'VOIDED'`,
  ];
  const expenseWhere: Prisma.Sql[] = [
    Prisma.sql` e.shop_id = CAST(${shopId} AS uuid)`,
  ];

  if (!useUnbounded) {
    if (start) {
      salesWhere.push(Prisma.sql` s.sale_date >= ${start}`);
      expenseWhere.push(Prisma.sql` e.expense_date >= ${start}`);
    }
    if (end) {
      salesWhere.push(Prisma.sql` s.sale_date <= ${end}`);
      expenseWhere.push(Prisma.sql` e.expense_date <= ${end}`);
    }
  }

  const [salesRows, expenseRows, cogsRows] = await Promise.all([
    prisma.$queryRaw<{ day: string; sum: Prisma.Decimal | number | null }[]>(
      Prisma.sql`
        SELECT
          DATE(s.sale_date AT TIME ZONE 'Asia/Dhaka')::text AS day,
          SUM(COALESCE(s.total_amount, 0)) AS sum
        FROM "sales" s
        WHERE ${Prisma.join(salesWhere, " AND ")}
        GROUP BY day
        ORDER BY day
      `
    ),
    prisma.$queryRaw<{ day: string; sum: Prisma.Decimal | number | null }[]>(
      Prisma.sql`
        SELECT
          e.expense_date::text AS day,
          SUM(COALESCE(e.amount, 0)) AS sum
        FROM "expenses" e
        WHERE ${Prisma.join(expenseWhere, " AND ")}
        GROUP BY day
        ORDER BY day
      `
    ),
    needsCogs
      ? prisma.$queryRaw<{ day: string; sum: Prisma.Decimal | number | null }[]>(
          Prisma.sql`
            SELECT
              DATE(s.sale_date AT TIME ZONE 'Asia/Dhaka')::text AS day,
              SUM(CAST(si.quantity AS numeric) * COALESCE(si.cost_at_sale, p.buy_price, 0)) AS sum
            FROM "sale_items" si
            JOIN "sales" s ON s.id = si.sale_id
            LEFT JOIN "products" p ON p.id = si.product_id
            WHERE ${Prisma.join(salesWhere, " AND ")}
            GROUP BY day
            ORDER BY day
          `
        )
      : Promise.resolve([]),
  ]);

  const salesByDate = new Map<string, number>();
  salesRows.forEach((row) => {
    salesByDate.set(row.day, Number(row.sum ?? 0));
  });

  const expensesByDate = new Map<string, number>();
  expenseRows.forEach((row) => {
    expensesByDate.set(row.day, Number(row.sum ?? 0));
  });

  const cogsByDate = new Map<string, number>();
  cogsRows.forEach((row) => {
    cogsByDate.set(row.day, Number(row.sum ?? 0));
  });

  const allDates = new Set<string>([
    ...salesByDate.keys(),
    ...expensesByDate.keys(),
    ...cogsByDate.keys(),
  ]);

  return Array.from(allDates)
    .sort()
    .map((date) => ({
      date,
      sales: salesByDate.get(date) || 0,
      expense: (expensesByDate.get(date) || 0) + (cogsByDate.get(date) || 0),
    }));
}

const getProfitTrendCached = unstable_cache(
  async (shopId: string, from?: string, to?: string) =>
    computeProfitTrendReport(shopId, from, to),
  ["reports-profit-trend"],
  { revalidate: 60, tags: [REPORTS_CACHE_TAGS.profitTrend] }
);

export async function getProfitTrendReport(
  shopId: string,
  from?: string,
  to?: string
) {
  const user = await requireUser();
  ensureReportPermission(user, "view_profit_report");
  await assertShopAccess(shopId, user);
  return getProfitTrendCached(shopId, from, to);
}

/* --------------------------------------------------
   TOP PRODUCTS REPORT
-------------------------------------------------- */
async function computeTopProductsReport(shopId: string, limit: number) {
  const topProducts = await prisma.saleItem.groupBy({
    by: ["productId"],
    where: {
      sale: {
        shopId,
        status: { not: "VOIDED" },
      },
    },
    _sum: {
      quantity: true,
      lineTotal: true,
    },
    orderBy: {
      _sum: {
        lineTotal: "desc",
      },
    },
    take: limit,
  });

  const productIds = topProducts.map((p) => p.productId);
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
    },
    select: {
      id: true,
      name: true,
    },
  });

  const productMap = new Map(products.map((p) => [p.id, p.name]));

  return topProducts.map((item) => ({
    name: productMap.get(item.productId) || "Unknown",
    qty: Number(item._sum.quantity || 0),
    revenue: Number(item._sum.lineTotal || 0),
  }));
}

const getTopProductsCached = unstable_cache(
  async (shopId: string, limit: number) =>
    computeTopProductsReport(shopId, limit),
  ["reports-top-products"],
  { revalidate: 60, tags: [REPORTS_CACHE_TAGS.topProducts] }
);

export async function getTopProductsReport(
  shopId: string,
  limit?: number | null
) {
  const user = await requireUser();
  ensureReportPermission(user, "view_top_products_report");
  await assertShopAccess(shopId, user);
  const safeLimit = clampReportLimit(limit);
  return getTopProductsCached(shopId, safeLimit);
}

/* --------------------------------------------------
   LOW STOCK REPORT
-------------------------------------------------- */
async function computeLowStockReport(shopId: string, limit: number) {
  const lowStockProducts = await prisma.product.findMany({
    where: {
      shopId,
      isActive: true,
      trackStock: true,
      stockQty: {
        lte: limit,
      },
    },
    select: {
      id: true,
      name: true,
      stockQty: true,
    },
    orderBy: {
      stockQty: "asc",
    },
    take: limit,
  });

  return lowStockProducts.map((p) => ({
    id: p.id,
    name: p.name,
    stockQty: Number(p.stockQty),
  }));
}

const getLowStockCached = unstable_cache(
  async (shopId: string, limit: number) => computeLowStockReport(shopId, limit),
  ["reports-low-stock"],
  { revalidate: 60, tags: [REPORTS_CACHE_TAGS.lowStock] }
);

export async function getLowStockReport(
  shopId: string,
  limit?: number | null
) {
  const user = await requireUser();
  ensureReportPermission(user, "view_low_stock_report");
  await assertShopAccess(shopId, user);
  const safeLimit = clampReportLimit(limit);
  return getLowStockCached(shopId, safeLimit);
}
