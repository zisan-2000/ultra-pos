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
import {
  getDhakaDateString,
  normalizeDhakaBusinessDate,
  parseDhakaDateOnlyRange,
} from "@/lib/dhaka-date";
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

function ensureReportPermission(user: UserContext, permission: string) {
  if (hasPermission(user, permission) || hasPermission(user, "view_reports")) {
    return;
  }
  throw new Error("Forbidden: missing permission " + permission);
}

const SUMMARY_REPORT_PERMISSIONS = [
  "view_sales_report",
  "view_expense_report",
  "view_cashbook_report",
  "view_profit_report",
] as const;

function ensureSummaryReportPermissions(user: UserContext) {
  for (const permission of SUMMARY_REPORT_PERMISSIONS) {
    ensureReportPermission(user, permission);
  }
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

  const startInput = from ? normalizeDhakaBusinessDate(from) : undefined;
  const endInput = to
    ? normalizeDhakaBusinessDate(to)
    : normalizeDhakaBusinessDate();
  const { start, end } = ensureBoundedRange(startInput, endInput);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  const rows = await prisma.$queryRaw<
    { day: Date; sum: Prisma.Decimal | number | null }[]
  >(Prisma.sql`
    SELECT
      s.business_date AS day,
      SUM(CAST(si.quantity AS numeric) * COALESCE(si.cost_at_sale, p.buy_price, 0)) AS sum
    FROM "sale_items" si
    JOIN "sales" s ON s.id = si.sale_id
    JOIN "products" p ON p.id = si.product_id
    WHERE s.shop_id = CAST(${shopId} AS uuid)
      AND s.status <> 'VOIDED'
      AND s.business_date >= CAST(${startDate} AS date)
      AND s.business_date <= CAST(${endDate} AS date)
    GROUP BY s.business_date
    ORDER BY s.business_date
  `);

  const returnedRows = await prisma.$queryRaw<
    { day: Date; sum: Prisma.Decimal | number | null }[]
  >(Prisma.sql`
    SELECT
      sr.business_date AS day,
      SUM(CAST(sri.quantity AS numeric) * COALESCE(sri.cost_at_return, p.buy_price, 0)) AS sum
    FROM "sale_return_items" sri
    JOIN "sale_returns" sr ON sr.id = sri.sale_return_id
    JOIN "products" p ON p.id = sri.product_id
    WHERE sr.shop_id = CAST(${shopId} AS uuid)
      AND sr.status = 'completed'
      AND sr.business_date >= CAST(${startDate} AS date)
      AND sr.business_date <= CAST(${endDate} AS date)
    GROUP BY sr.business_date
    ORDER BY sr.business_date
  `);

  const exchangeRows = await prisma.$queryRaw<
    { day: Date; sum: Prisma.Decimal | number | null }[]
  >(Prisma.sql`
    SELECT
      sr.business_date AS day,
      SUM(CAST(srei.quantity AS numeric) * COALESCE(srei.cost_at_return, p.buy_price, 0)) AS sum
    FROM "sale_return_exchange_items" srei
    JOIN "sale_returns" sr ON sr.id = srei.sale_return_id
    JOIN "products" p ON p.id = srei.product_id
    WHERE sr.shop_id = CAST(${shopId} AS uuid)
      AND sr.status = 'completed'
      AND sr.business_date >= CAST(${startDate} AS date)
      AND sr.business_date <= CAST(${endDate} AS date)
    GROUP BY sr.business_date
    ORDER BY sr.business_date
  `);

  const salesByDay: Record<string, number> = {};
  const returnedByDay: Record<string, number> = {};
  const exchangeByDay: Record<string, number> = {};

  rows.forEach((r) => {
    const day = getDhakaDateString(new Date(r.day));
    salesByDay[day] = Number(r.sum ?? 0);
  });
  returnedRows.forEach((r) => {
    const day = getDhakaDateString(new Date(r.day));
    returnedByDay[day] = Number(r.sum ?? 0);
  });
  exchangeRows.forEach((r) => {
    const day = getDhakaDateString(new Date(r.day));
    exchangeByDay[day] = Number(r.sum ?? 0);
  });

  const allDays = new Set<string>([
    ...Object.keys(salesByDay),
    ...Object.keys(returnedByDay),
    ...Object.keys(exchangeByDay),
  ]);

  const byDay: Record<string, number> = {};
  for (const day of allDays) {
    byDay[day] =
      Number(salesByDay[day] ?? 0) -
      Number(returnedByDay[day] ?? 0) +
      Number(exchangeByDay[day] ?? 0);
  }
  return byDay;
}

const parseDateRange = (from?: string, to?: string) =>
  parseDhakaDateOnlyRange(from, to, true);

async function computeSaleReturnNetAmount(
  shopId: string,
  start?: Date,
  end?: Date
) {
  const where: Prisma.SaleReturnWhereInput = {
    shopId,
    status: "completed",
    businessDate: {
      gte: start ?? undefined,
      lte: end ?? undefined,
    },
  };

  const agg = await prisma.saleReturn.aggregate({
    where,
    _sum: { netAmount: true },
  });

  return Number(agg._sum.netAmount ?? 0);
}

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
  value?: string | null;
};

type ReportSortDirection = "asc" | "desc";

type ReportPaginationInput = {
  shopId: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: { at?: Date | null; id: string; value?: string | null } | null;
};

type SalesReportPaginationInput = ReportPaginationInput & {
  search?: string | null;
  paymentMethod?: string | null;
  saleStatus?: "all" | "paid" | "due" | null;
  sortBy?: "date" | "amount" | null;
  sortDir?: ReportSortDirection | null;
};

type ExpenseReportPaginationInput = ReportPaginationInput & {
  search?: string | null;
  category?: string | null;
  sortBy?: "date" | "amount" | null;
  sortDir?: ReportSortDirection | null;
};

type CashReportPaginationInput = ReportPaginationInput & {
  search?: string | null;
  entryType?: "all" | "IN" | "OUT" | null;
  sortBy?: "date" | "amount" | null;
  sortDir?: ReportSortDirection | null;
};

function cleanReportText(value?: string | null) {
  const text = value?.trim();
  return text ? text.slice(0, 80) : null;
}

function normalizeSortDir(value?: ReportSortDirection | null): ReportSortDirection {
  return value === "asc" ? "asc" : "desc";
}

/* --------------------------------------------------
   SALES LIST WITH DATE FILTER
-------------------------------------------------- */
export async function getSalesWithFilterPaginated({
  shopId,
  from,
  to,
  limit,
  cursor,
  search,
  paymentMethod,
  saleStatus,
  sortBy,
  sortDir,
}: SalesReportPaginationInput) {
  const user = await requireUser();
  ensureReportPermission(user, "view_sales_report");
  await assertShopAccess(shopId, user);
  const safeLimit = normalizeLimit(limit);
  const safeSearch = cleanReportText(search);
  const safePayment = cleanReportText(paymentMethod);
  const safeStatus = saleStatus === "due" || saleStatus === "paid" ? saleStatus : "all";
  const safeSortBy = sortBy === "amount" ? "amount" : "date";
  const safeSortDir = normalizeSortDir(sortDir);
  const parsed = parseDateRange(from, to);
  const useUnbounded = !from && !to;
  const { start, end } = useUnbounded
    ? { start: undefined, end: undefined }
    : clampRange(parsed.start, parsed.end, 90);

  const where: Prisma.SaleWhereInput = {
    shopId,
    status: { not: "VOIDED" },
    businessDate: {
      gte: start ?? undefined,
      lte: end ?? undefined,
    },
  };

  const and: Prisma.SaleWhereInput[] = [];

  if (safeSearch) {
    and.push({
      OR: [
        { invoiceNo: { contains: safeSearch, mode: "insensitive" } },
        { note: { contains: safeSearch, mode: "insensitive" } },
        {
          customer: {
            OR: [
              { name: { contains: safeSearch, mode: "insensitive" } },
              { phone: { contains: safeSearch, mode: "insensitive" } },
            ],
          },
        },
      ],
    });
  }

  if (safePayment && safePayment !== "all") {
    and.push({ paymentMethod: safePayment });
  }

  if (safeStatus === "due") {
    and.push({ paymentMethod: "due" });
  } else if (safeStatus === "paid") {
    and.push({ paymentMethod: { not: "due" } });
  }

  if (cursor) {
    if (safeSortBy === "amount" && cursor.value !== undefined && cursor.value !== null) {
      const value = new Prisma.Decimal(cursor.value);
      and.push({
        OR:
          safeSortDir === "asc"
            ? [
                { totalAmount: { gt: value } },
                { totalAmount: value, id: { gt: cursor.id } },
              ]
            : [
                { totalAmount: { lt: value } },
                { totalAmount: value, id: { lt: cursor.id } },
              ],
      });
    } else if (cursor.at) {
      and.push({
        OR: [
          safeSortDir === "asc"
            ? { saleDate: { gt: cursor.at } }
            : { saleDate: { lt: cursor.at } },
          {
            saleDate: cursor.at,
            id: safeSortDir === "asc" ? { gt: cursor.id } : { lt: cursor.id },
          },
        ],
      });
    }
  }

  if (and.length > 0) {
    where.AND = and;
  }

  const rows = await prisma.sale.findMany({
    where,
    select: {
      id: true,
      invoiceNo: true,
      saleDate: true,
      totalAmount: true,
      paidAmount: true,
      discountAmount: true,
      status: true,
      paymentMethod: true,
      note: true,
      customer: {
        select: {
          name: true,
          phone: true,
        },
      },
      _count: {
        select: {
          saleItems: true,
        },
      },
    },
    orderBy:
      safeSortBy === "amount"
        ? [{ totalAmount: safeSortDir }, { id: safeSortDir }]
        : [{ saleDate: safeSortDir }, { id: safeSortDir }],
    take: safeLimit + 1,
  });

  const hasMore = rows.length > safeLimit;
  const pageRows = rows.slice(0, safeLimit);
  const last = pageRows[pageRows.length - 1];
  const nextCursor: ReportCursor | null =
    hasMore && last
      ? {
          at: last.saleDate.toISOString(),
          id: last.id,
          value:
            safeSortBy === "amount" ? String(last.totalAmount) : undefined,
        }
      : null;

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
  search,
  category,
  sortBy,
  sortDir,
}: ExpenseReportPaginationInput) {
  const user = await requireUser();
  ensureReportPermission(user, "view_expense_report");
  await assertShopAccess(shopId, user);
  const safeLimit = normalizeLimit(limit);
  const safeSearch = cleanReportText(search);
  const safeCategory = cleanReportText(category);
  const safeSortBy = sortBy === "amount" ? "amount" : "date";
  const safeSortDir = normalizeSortDir(sortDir);
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

  const and: Prisma.ExpenseWhereInput[] = [];

  if (safeSearch) {
    and.push({
      OR: [
        { category: { contains: safeSearch, mode: "insensitive" } },
        { note: { contains: safeSearch, mode: "insensitive" } },
      ],
    });
  }

  if (safeCategory && safeCategory !== "all") {
    and.push({ category: { contains: safeCategory, mode: "insensitive" } });
  }

  if (cursor) {
    if (safeSortBy === "amount" && cursor.value !== undefined && cursor.value !== null) {
      const value = new Prisma.Decimal(cursor.value);
      and.push({
        OR:
          safeSortDir === "asc"
            ? [
                { amount: { gt: value } },
                { amount: value, id: { gt: cursor.id } },
              ]
            : [
                { amount: { lt: value } },
                { amount: value, id: { lt: cursor.id } },
              ],
      });
    } else if (cursor.at) {
      and.push({
        OR: [
          safeSortDir === "asc"
            ? { expenseDate: { gt: cursor.at } }
            : { expenseDate: { lt: cursor.at } },
          {
            expenseDate: cursor.at,
            id: safeSortDir === "asc" ? { gt: cursor.id } : { lt: cursor.id },
          },
        ],
      });
    }
  }

  if (and.length > 0) {
    where.AND = and;
  }

  const rows = await prisma.expense.findMany({
    where,
    select: {
      id: true,
      expenseDate: true,
      createdAt: true,
      amount: true,
      category: true,
      note: true,
    },
    orderBy:
      safeSortBy === "amount"
        ? [{ amount: safeSortDir }, { id: safeSortDir }]
        : [{ expenseDate: safeSortDir }, { id: safeSortDir }],
    take: safeLimit + 1,
  });

  const hasMore = rows.length > safeLimit;
  const pageRows = rows.slice(0, safeLimit);
  const last = pageRows[pageRows.length - 1];
  const nextCursor: ReportCursor | null =
    hasMore && last
      ? {
          at: last.expenseDate.toISOString(),
          id: last.id,
          value: safeSortBy === "amount" ? String(last.amount) : undefined,
        }
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
  search,
  entryType,
  sortBy,
  sortDir,
}: CashReportPaginationInput) {
  const user = await requireUser();
  ensureReportPermission(user, "view_cashbook_report");
  await assertShopAccess(shopId, user);
  const safeLimit = normalizeLimit(limit);
  const safeSearch = cleanReportText(search);
  const safeEntryType = entryType === "IN" || entryType === "OUT" ? entryType : "all";
  const safeSortBy = sortBy === "amount" ? "amount" : "date";
  const safeSortDir = normalizeSortDir(sortDir);
  const parsed = parseDateRange(from, to);
  const useUnbounded = !from && !to;
  const { start, end } = useUnbounded
    ? { start: undefined, end: undefined }
    : clampRange(parsed.start, parsed.end, 90);

  const where: Prisma.CashEntryWhereInput = {
    shopId,
    businessDate: {
      gte: start ?? undefined,
      lte: end ?? undefined,
    },
  };

  const and: Prisma.CashEntryWhereInput[] = [];

  if (safeSearch) {
    and.push({ reason: { contains: safeSearch, mode: "insensitive" } });
  }

  if (safeEntryType !== "all") {
    and.push({ entryType: safeEntryType });
  }

  if (cursor) {
    if (safeSortBy === "amount" && cursor.value !== undefined && cursor.value !== null) {
      const value = new Prisma.Decimal(cursor.value);
      and.push({
        OR:
          safeSortDir === "asc"
            ? [
                { amount: { gt: value } },
                { amount: value, id: { gt: cursor.id } },
              ]
            : [
                { amount: { lt: value } },
                { amount: value, id: { lt: cursor.id } },
              ],
      });
    } else if (cursor.at) {
      and.push({
        OR: [
          safeSortDir === "asc"
            ? { createdAt: { gt: cursor.at } }
            : { createdAt: { lt: cursor.at } },
          {
            createdAt: cursor.at,
            id: safeSortDir === "asc" ? { gt: cursor.id } : { lt: cursor.id },
          },
        ],
      });
    }
  }

  if (and.length > 0) {
    where.AND = and;
  }

  const rows = await prisma.cashEntry.findMany({
    where,
    select: {
      id: true,
      entryType: true,
      amount: true,
      reason: true,
      createdAt: true,
      businessDate: true,
    },
    orderBy:
      safeSortBy === "amount"
        ? [{ amount: safeSortDir }, { id: safeSortDir }]
        : [{ createdAt: safeSortDir }, { id: safeSortDir }],
    take: safeLimit + 1,
  });

  const hasMore = rows.length > safeLimit;
  const pageRows = rows.slice(0, safeLimit);
  const last = pageRows[pageRows.length - 1];
  const nextCursor: ReportCursor | null =
    hasMore && last
      ? {
          at: last.createdAt.toISOString(),
          id: last.id,
          value: safeSortBy === "amount" ? String(last.amount) : undefined,
        }
      : null;

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
  const parsed = parseDateRange(from, to);
  const useUnbounded = !from && !to;
  const { start, end } = useUnbounded
    ? { start: undefined, end: undefined }
    : clampRange(parsed.start, parsed.end, 90);
  const where: Prisma.SaleWhereInput = {
    shopId,
    status: { not: "VOIDED" },
    businessDate: {
      gte: start ?? undefined,
      lte: end ?? undefined,
    },
  };

  const [agg, voided, returnNet] = await Promise.all([
    prisma.sale.aggregate({
      where,
      _sum: { totalAmount: true, discountAmount: true, taxAmount: true },
      _count: { _all: true },
    }),
    prisma.sale.count({
      where: {
        shopId,
        status: "VOIDED",
        businessDate: {
          gte: start ?? undefined,
          lte: end ?? undefined,
        },
      },
    }),
    prisma.saleReturn.aggregate({
      where: {
        shopId,
        status: "completed",
        businessDate: {
          gte: start ?? undefined,
          lte: end ?? undefined,
        },
      },
      _sum: {
        netAmount: true,
        returnedTaxAmount: true,
        exchangeTaxAmount: true,
      },
    }),
  ]);

  const totalAmount =
    Number(agg._sum.totalAmount ?? 0) + Number(returnNet._sum.netAmount ?? 0);
  const completedCount = agg._count._all ?? 0;
  const voidedCount = voided ?? 0;

  return {
    totalAmount,
    discountAmount: Number(agg._sum.discountAmount ?? 0),
    taxAmount:
      Number(agg._sum.taxAmount ?? 0) -
      Number(returnNet._sum.returnedTaxAmount ?? 0) +
      Number(returnNet._sum.exchangeTaxAmount ?? 0),
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
    revalidate: 60,
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
    revalidate: 60,
    tags: [REPORTS_CACHE_TAGS.expenseSummary, REPORTS_CACHE_TAGS.summary],
  }
);

async function computeCashSummary(
  shopId: string,
  from?: string,
  to?: string
) {
  const parsed = parseDateRange(from, to);
  const useUnbounded = !from && !to;
  const { start, end } = useUnbounded
    ? { start: undefined, end: undefined }
    : clampRange(parsed.start, parsed.end, 90);

  const startDate = start ? start.toISOString().slice(0, 10) : undefined;
  const endDate = end ? end.toISOString().slice(0, 10) : undefined;

  // Use raw SQL for better performance
  const result = await prisma.$queryRaw<
    { totalIn: Prisma.Decimal | number; totalOut: Prisma.Decimal | number }[]
  >(Prisma.sql`
    SELECT
      COALESCE(SUM(CASE WHEN entry_type = 'IN' THEN amount ELSE 0 END), 0) AS "totalIn",
      COALESCE(SUM(CASE WHEN entry_type = 'OUT' THEN amount ELSE 0 END), 0) AS "totalOut"
    FROM "cash_entries"
    WHERE shop_id = CAST(${shopId} AS uuid)
    ${
      useUnbounded
        ? Prisma.empty
        : Prisma.sql`AND business_date >= CAST(${startDate} AS date)
        AND business_date <= CAST(${endDate} AS date)`
    }
  `);

  const row = result[0];
  const totalIn = Number(row?.totalIn ?? 0);
  const totalOut = Number(row?.totalOut ?? 0);

  return {
    totalIn,
    totalOut,
    balance: totalIn - totalOut,
  };
}

const getCashSummaryCached = unstable_cache(
  async (shopId: string, from?: string, to?: string) =>
    computeCashSummary(shopId, from, to),
  ["reports-cash-summary"],
  {
    revalidate: 60,
    tags: [REPORTS_CACHE_TAGS.cashSummary, REPORTS_CACHE_TAGS.summary],
  }
);

async function computeProfitSummary(
  shopId: string,
  from?: string,
  to?: string
) {
  const [salesData, expenseData] = await Promise.all([
    computeSalesSummary(shopId, from, to),
    computeExpenseSummary(shopId, from, to),
  ]);
  const netSalesRevenue =
    salesData.totalAmount - Number(salesData.taxAmount ?? 0);
  return computeProfitFromTotals(
    shopId,
    netSalesRevenue,
    expenseData.totalAmount,
    from,
    to
  );
}

async function computeProfitFromTotals(
  shopId: string,
  salesTotal: number,
  expenseTotal: number,
  from?: string,
  to?: string
) {
  const parsed = parseDateRange(from, to);
  const useUnbounded = !from && !to;
  const bounded = useUnbounded
    ? null
    : clampRange(parsed.start, parsed.end, 90);
  const needsCogs = await shopNeedsCogs(shopId);
  const cogs = needsCogs
    ? await getCogsTotalRaw(shopId, bounded?.start, bounded?.end)
    : 0;
  const totalExpense = expenseTotal + cogs;
  return {
    salesTotal,
    expenseTotal: totalExpense,
    profit: salesTotal - totalExpense,
    cogs,
  };
}

async function getSummaryBundleInternal(
  shopId: string,
  from?: string,
  to?: string,
  fresh = false
) {
  const salesTask = fresh
    ? computeSalesSummary(shopId, from, to)
    : getSalesSummaryCached(shopId, from, to);
  const expenseTask = fresh
    ? computeExpenseSummary(shopId, from, to)
    : getExpenseSummaryCached(shopId, from, to);
  const cashTask = fresh
    ? computeCashSummary(shopId, from, to)
    : getCashSummaryCached(shopId, from, to);
  const [sales, expense, cash] = await Promise.all([
    salesTask,
    expenseTask,
    cashTask,
  ]);
  const netSalesRevenue = sales.totalAmount - Number(sales.taxAmount ?? 0);
  const profit = await computeProfitFromTotals(
    shopId,
    netSalesRevenue,
    expense.totalAmount,
    from,
    to
  );
  return { sales, expense, cash, profit };
}

export async function getReportSummaryBundle(
  shopId: string,
  from?: string,
  to?: string,
  options?: { fresh?: boolean }
) {
  const user = await requireUser();
  ensureSummaryReportPermissions(user);
  await assertShopAccess(shopId, user);
  return getSummaryBundleInternal(shopId, from, to, options?.fresh === true);
}

const getProfitSummaryCached = unstable_cache(
  async (shopId: string, from?: string, to?: string) =>
    computeProfitSummary(shopId, from, to),
  ["reports-profit-summary"],
  {
    revalidate: 60,
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
  const { start, end } = parseDateRange(from, to);
  const useUnbounded = !from && !to;

  const [sales, returnAgg] = await Promise.all([
    prisma.sale.groupBy({
      by: ["paymentMethod"],
      where: {
        shopId,
        status: { not: "VOIDED" },
        businessDate: useUnbounded
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
    }),
    prisma.saleReturn.aggregate({
      where: {
        shopId,
        status: "completed",
        businessDate: useUnbounded
          ? undefined
          : {
              gte: start,
              lte: end,
            },
      },
      _sum: {
        netAmount: true,
      },
      _count: {
        _all: true,
      },
    }),
  ]);

  const rows = sales.map((s) => ({
    name: s.paymentMethod || "Unknown",
    value: Number(s._sum.totalAmount || 0),
    count: s._count.id,
  }));

  const returnNet = Number(returnAgg._sum.netAmount ?? 0);
  const returnCount = Number(returnAgg._count._all ?? 0);
  if (returnCount > 0 && returnNet !== 0) {
    rows.push({
      name: "return_adjustment",
      value: returnNet,
      count: returnCount,
    });
  }

  return rows;
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
  const { start, end } = parseDateRange(from, to);
  const useUnbounded = !from && !to;
  const needsCogs = await shopNeedsCogs(shopId);
  const startDate = start ? start.toISOString().slice(0, 10) : undefined;
  const endDate = end ? end.toISOString().slice(0, 10) : undefined;

  const salesWhere: Prisma.Sql[] = [
    Prisma.sql` s.shop_id = CAST(${shopId} AS uuid)`,
    Prisma.sql` s.status <> 'VOIDED'`,
  ];
  const expenseWhere: Prisma.Sql[] = [
    Prisma.sql` e.shop_id = CAST(${shopId} AS uuid)`,
  ];
  const returnWhere: Prisma.Sql[] = [
    Prisma.sql` sr.shop_id = CAST(${shopId} AS uuid)`,
    Prisma.sql` sr.status = 'completed'`,
  ];

  if (!useUnbounded) {
    if (startDate) {
      salesWhere.push(Prisma.sql` s.business_date >= CAST(${startDate} AS date)`);
      expenseWhere.push(Prisma.sql` e.expense_date >= CAST(${startDate} AS date)`);
      returnWhere.push(Prisma.sql` sr.business_date >= CAST(${startDate} AS date)`);
    }
    if (endDate) {
      salesWhere.push(Prisma.sql` s.business_date <= CAST(${endDate} AS date)`);
      expenseWhere.push(Prisma.sql` e.expense_date <= CAST(${endDate} AS date)`);
      returnWhere.push(Prisma.sql` sr.business_date <= CAST(${endDate} AS date)`);
    }
  }

  const [salesRows, expenseRows, cogsRows] = await Promise.all([
    prisma.$queryRaw<{ day: string; sum: Prisma.Decimal | number | null }[]>(
      Prisma.sql`
        SELECT day, SUM(amount) AS sum
        FROM (
          SELECT
            s.business_date::text AS day,
            SUM(COALESCE(s.total_amount, 0)) AS amount
          FROM "sales" s
          WHERE ${Prisma.join(salesWhere, " AND ")}
          GROUP BY s.business_date

          UNION ALL

          SELECT
            sr.business_date::text AS day,
            SUM(COALESCE(sr.net_amount, 0)) AS amount
          FROM "sale_returns" sr
          WHERE ${Prisma.join(returnWhere, " AND ")}
          GROUP BY sr.business_date
        ) sales_union
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
        GROUP BY e.expense_date
        ORDER BY e.expense_date
      `
    ),
    needsCogs
      ? prisma.$queryRaw<{ day: string; sum: Prisma.Decimal | number | null }[]>(
          Prisma.sql`
            SELECT day, SUM(amount) AS sum
            FROM (
              SELECT
                s.business_date::text AS day,
                SUM(CAST(si.quantity AS numeric) * COALESCE(si.cost_at_sale, p.buy_price, 0)) AS amount
              FROM "sale_items" si
              JOIN "sales" s ON s.id = si.sale_id
              LEFT JOIN "products" p ON p.id = si.product_id
              WHERE ${Prisma.join(salesWhere, " AND ")}
              GROUP BY s.business_date

              UNION ALL

              SELECT
                sr.business_date::text AS day,
                -SUM(CAST(sri.quantity AS numeric) * COALESCE(sri.cost_at_return, p.buy_price, 0)) AS amount
              FROM "sale_return_items" sri
              JOIN "sale_returns" sr ON sr.id = sri.sale_return_id
              LEFT JOIN "products" p ON p.id = sri.product_id
              WHERE ${Prisma.join(returnWhere, " AND ")}
              GROUP BY sr.business_date

              UNION ALL

              SELECT
                sr.business_date::text AS day,
                SUM(CAST(srei.quantity AS numeric) * COALESCE(srei.cost_at_return, p.buy_price, 0)) AS amount
              FROM "sale_return_exchange_items" srei
              JOIN "sale_returns" sr ON sr.id = srei.sale_return_id
              LEFT JOIN "products" p ON p.id = srei.product_id
              WHERE ${Prisma.join(returnWhere, " AND ")}
              GROUP BY sr.business_date
            ) cogs_union
            GROUP BY day
            ORDER BY day
          `
        )
      : Promise.resolve([]),
  ]);

  const salesByDate = new Map<string, number>();
  const expenseByDate = new Map<string, number>();
  const salesCogsByDate = new Map<string, number>();

  for (const row of salesRows) {
    salesByDate.set(row.day, Number(row.sum ?? 0));
  }
  for (const row of expenseRows) {
    expenseByDate.set(row.day, Number(row.sum ?? 0));
  }
  for (const row of cogsRows) {
    salesCogsByDate.set(row.day, Number(row.sum ?? 0));
  }

  const allDates = new Set<string>([
    ...salesByDate.keys(),
    ...expenseByDate.keys(),
    ...salesCogsByDate.keys(),
  ]);

  return Array.from(allDates)
    .sort()
    .map((date) => {
      const salesNet = Number(salesByDate.get(date) ?? 0);
      const operatingExpense = Number(expenseByDate.get(date) ?? 0);
      const cogsNet = needsCogs ? Number(salesCogsByDate.get(date) ?? 0) : 0;
      const grossProfit = salesNet - cogsNet;
      const netProfit = grossProfit - operatingExpense;
      const expenseNet = operatingExpense + cogsNet;
      return {
        date,
        sales: Number(salesNet.toFixed(2)),
        expense: Number(expenseNet.toFixed(2)),
        operatingExpense: Number(operatingExpense.toFixed(2)),
        cogs: Number(cogsNet.toFixed(2)),
        grossProfit: Number(grossProfit.toFixed(2)),
        netProfit: Number(netProfit.toFixed(2)),
        grossMarginPct: Number(
          (salesNet ? (grossProfit / salesNet) * 100 : 0).toFixed(2)
        ),
        netMarginPct: Number(
          (salesNet ? (netProfit / salesNet) * 100 : 0).toFixed(2)
        ),
      };
    });
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
async function computeTopProductsReport(
  shopId: string,
  limit: number,
  from?: string,
  to?: string
) {
  const { start, end } = parseDateRange(from, to);
  const useUnbounded = !from && !to;
  const startDate = start ? start.toISOString().slice(0, 10) : undefined;
  const endDate = end ? end.toISOString().slice(0, 10) : undefined;
  const salesWhere: Prisma.Sql[] = [
    Prisma.sql`s.shop_id = CAST(${shopId} AS uuid)`,
    Prisma.sql`s.status <> 'VOIDED'`,
  ];
  const returnWhere: Prisma.Sql[] = [
    Prisma.sql`sr.shop_id = CAST(${shopId} AS uuid)`,
    Prisma.sql`sr.status = 'completed'`,
  ];

  if (!useUnbounded) {
    if (startDate) {
      salesWhere.push(Prisma.sql`s.business_date >= CAST(${startDate} AS date)`);
      returnWhere.push(Prisma.sql`sr.business_date >= CAST(${startDate} AS date)`);
    }
    if (endDate) {
      salesWhere.push(Prisma.sql`s.business_date <= CAST(${endDate} AS date)`);
      returnWhere.push(Prisma.sql`sr.business_date <= CAST(${endDate} AS date)`);
    }
  }

  const topProducts = await prisma.$queryRaw<
    {
      product_id: string;
      qty: Prisma.Decimal | number | null;
      revenue: Prisma.Decimal | number | null;
    }[]
  >(
    Prisma.sql`
      WITH sales_lines AS (
        SELECT
          si.product_id AS product_id,
          CAST(si.quantity AS numeric) AS qty_delta,
          CAST(si.line_total AS numeric) AS revenue_delta
        FROM "sale_items" si
        JOIN "sales" s ON s.id = si.sale_id
        WHERE ${Prisma.join(salesWhere, " AND ")}
      ),
      return_lines AS (
        SELECT
          sri.product_id AS product_id,
          -CAST(sri.quantity AS numeric) AS qty_delta,
          -CAST(sri.line_total AS numeric) AS revenue_delta
        FROM "sale_return_items" sri
        JOIN "sale_returns" sr ON sr.id = sri.sale_return_id
        WHERE ${Prisma.join(returnWhere, " AND ")}
      ),
      exchange_lines AS (
        SELECT
          srei.product_id AS product_id,
          CAST(srei.quantity AS numeric) AS qty_delta,
          CAST(srei.line_total AS numeric) AS revenue_delta
        FROM "sale_return_exchange_items" srei
        JOIN "sale_returns" sr ON sr.id = srei.sale_return_id
        WHERE ${Prisma.join(returnWhere, " AND ")}
      ),
      merged AS (
        SELECT * FROM sales_lines
        UNION ALL
        SELECT * FROM return_lines
        UNION ALL
        SELECT * FROM exchange_lines
      )
      SELECT
        product_id,
        SUM(qty_delta) AS qty,
        SUM(revenue_delta) AS revenue
      FROM merged
      GROUP BY product_id
      ORDER BY revenue DESC
      LIMIT ${limit}
    `
  );

  const productIds = topProducts.map((p) => p.product_id);
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
    name: productMap.get(item.product_id) || "Unknown",
    qty: Number(item.qty || 0),
    revenue: Number(item.revenue || 0),
  }));
}

const getTopProductsCached = unstable_cache(
  async (shopId: string, limit: number, from?: string, to?: string) =>
    computeTopProductsReport(shopId, limit, from, to),
  ["reports-top-products"],
  { revalidate: 60, tags: [REPORTS_CACHE_TAGS.topProducts] }
);

export async function getTopProductsReport(
  shopId: string,
  limit?: number | null,
  from?: string,
  to?: string
) {
  const user = await requireUser();
  ensureReportPermission(user, "view_top_products_report");
  await assertShopAccess(shopId, user);
  const safeLimit = clampReportLimit(limit);
  return getTopProductsCached(shopId, safeLimit, from, to);
}

/* --------------------------------------------------
   STOCK VALUATION REPORT
-------------------------------------------------- */
async function computeStockValuationReport(shopId: string, limit: number) {
  const [simpleProducts, variants] = await Promise.all([
    prisma.product.findMany({
      where: {
        shopId,
        isActive: true,
        trackStock: true,
        stockQty: { gt: 0 },
        variants: {
          none: {
            isActive: true,
          },
        },
      },
      select: {
        id: true,
        name: true,
        category: true,
        baseUnit: true,
        stockQty: true,
        buyPrice: true,
        sellPrice: true,
        reorderPoint: true,
        storageLocation: true,
        unitConversions: {
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
          select: {
            label: true,
            baseUnitQuantity: true,
          },
        },
      },
    }),
    prisma.productVariant.findMany({
      where: {
        shopId,
        isActive: true,
        stockQty: { gt: 0 },
        product: {
          shopId,
          isActive: true,
          trackStock: true,
        },
      },
      select: {
        id: true,
        label: true,
        stockQty: true,
        buyPrice: true,
        sellPrice: true,
        reorderPoint: true,
        storageLocation: true,
        product: {
          select: {
            id: true,
            name: true,
            category: true,
            baseUnit: true,
            buyPrice: true,
            sellPrice: true,
            reorderPoint: true,
            storageLocation: true,
            unitConversions: {
              where: { isActive: true },
              orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
              select: {
                label: true,
                baseUnitQuantity: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const rows = [
    ...simpleProducts.map((product) => {
      const qty = Number(product.stockQty ?? 0);
      const buyPrice = Number(product.buyPrice ?? 0);
      const sellPrice = Number(product.sellPrice ?? 0);
      return {
        id: product.id,
        productId: product.id,
        kind: "product" as const,
        name: product.name,
        category: product.category || "Uncategorized",
        unit: product.baseUnit || "pcs",
        qty,
        buyPrice,
        sellPrice,
        reorderPoint: product.reorderPoint ?? null,
        storageLocation: product.storageLocation ?? null,
        conversionSummary:
          product.unitConversions.length > 0
            ? product.unitConversions
                .map(
                  (conversion) =>
                    `1 ${conversion.label} = ${Number(conversion.baseUnitQuantity)} ${product.baseUnit || "pcs"}`
                )
                .join(" • ")
            : null,
        costValue: Number((qty * buyPrice).toFixed(2)),
        retailValue: Number((qty * sellPrice).toFixed(2)),
      };
    }),
    ...variants.map((variant) => {
      const qty = Number(variant.stockQty ?? 0);
      const buyPrice = Number(variant.buyPrice ?? variant.product.buyPrice ?? 0);
      const sellPrice = Number(variant.sellPrice ?? variant.product.sellPrice ?? 0);
      return {
        id: variant.id,
        productId: variant.product.id,
        kind: "variant" as const,
        name: `${variant.product.name} (${variant.label})`,
        category: variant.product.category || "Uncategorized",
        unit: variant.product.baseUnit || "pcs",
        qty,
        buyPrice,
        sellPrice,
        reorderPoint: variant.reorderPoint ?? variant.product.reorderPoint ?? null,
        storageLocation: variant.storageLocation ?? variant.product.storageLocation ?? null,
        conversionSummary:
          variant.product.unitConversions.length > 0
            ? variant.product.unitConversions
                .map(
                  (conversion) =>
                    `1 ${conversion.label} = ${Number(conversion.baseUnitQuantity)} ${variant.product.baseUnit || "pcs"}`
                )
                .join(" • ")
            : null,
        costValue: Number((qty * buyPrice).toFixed(2)),
        retailValue: Number((qty * sellPrice).toFixed(2)),
      };
    }),
  ]
    .filter((row) => row.qty > 0)
    .sort((a, b) => b.costValue - a.costValue || b.qty - a.qty)
    .slice(0, limit);

  const summary = rows.reduce(
    (acc, row) => {
      acc.costValue += row.costValue;
      acc.retailValue += row.retailValue;
      acc.totalQty += row.qty;
      return acc;
    },
    { costValue: 0, retailValue: 0, totalQty: 0 }
  );

  return {
    summary: {
      trackedItems: rows.length,
      totalQty: Number(summary.totalQty.toFixed(2)),
      costValue: Number(summary.costValue.toFixed(2)),
      retailValue: Number(summary.retailValue.toFixed(2)),
      estimatedGrossValue: Number((summary.retailValue - summary.costValue).toFixed(2)),
    },
    rows,
  };
}

const getStockValuationCached = unstable_cache(
  async (shopId: string, limit: number) =>
    computeStockValuationReport(shopId, limit),
  ["reports-stock-valuation"],
  { revalidate: 60, tags: [REPORTS_CACHE_TAGS.stockValuation] }
);

export async function getStockValuationReport(
  shopId: string,
  limit?: number | null
) {
  const user = await requireUser();
  ensureReportPermission(user, "view_profit_report");
  await assertShopAccess(shopId, user);
  const safeLimit = clampReportLimit(limit);
  return getStockValuationCached(shopId, safeLimit);
}

/* --------------------------------------------------
   LOW STOCK REPORT
-------------------------------------------------- */
async function computeLowStockReport(shopId: string, limit: number) {
  const rows = await prisma.$queryRaw<
    Array<{ id: string; name: string; stock_qty: Prisma.Decimal | number | null }>
  >(Prisma.sql`
    SELECT p.id, p.name, p.stock_qty
    FROM products p
    WHERE p.shop_id = CAST(${shopId} AS uuid)
      AND p.is_active = true
      AND p.track_stock = true
      AND NOT EXISTS (
        SELECT 1 FROM product_variants pv
        WHERE pv.product_id = p.id AND pv.is_active = true
      )
      AND p.stock_qty <= COALESCE(p.reorder_point, ${limit})

    UNION ALL

    SELECT pv.id,
           p.name || ' (' || pv.label || ')' AS name,
           pv.stock_qty
    FROM products p
    JOIN product_variants pv ON pv.product_id = p.id AND pv.is_active = true
    WHERE p.shop_id = CAST(${shopId} AS uuid)
      AND p.is_active = true
      AND p.track_stock = true
      AND pv.stock_qty <= COALESCE(pv.reorder_point, p.reorder_point, ${limit})

    ORDER BY stock_qty ASC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    stockQty: Number(row.stock_qty ?? 0),
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
