// app/actions/reports.ts

"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { REPORT_ROW_LIMIT } from "@/lib/reporting-config";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";

/* --------------------------------------------------
   DATE FILTER HELPER
-------------------------------------------------- */
function parseTimestampRange(from?: string, to?: string) {
  const isDateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

  const parse = (value?: string, mode?: "start" | "end") => {
    if (!value) return undefined;
    // If UI passes YYYY-MM-DD, interpret as Asia/Dhaka local day.
    if (isDateOnly(value)) {
      const tzOffset = "+06:00";
      const iso =
        mode === "end"
          ? `${value}T23:59:59.999${tzOffset}`
          : `${value}T00:00:00.000${tzOffset}`;
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? undefined : d;
    }

    // Otherwise assume ISO timestamp and keep the provided time boundaries.
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return undefined;
    return d;
  };

  const start = parse(from, "start");
  const end = parse(to, "end");
  return { start, end };
}

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

const SHOP_TYPES_WITH_COGS = new Set([
  "mini_grocery",
  "pharmacy",
  "clothing",
  "cosmetics_gift",
  "mini_wholesale",
]);

async function shopNeedsCogs(shopId: string) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) return false;
  return SHOP_TYPES_WITH_COGS.has((shop as any).businessType);
}

function sumCogs(rows: { qty: any; buyPrice: any }[]) {
  return rows.reduce((sum, r) => {
    const qty = Number(r.qty ?? 0);
    const buy = Number(r.buyPrice ?? 0);
    if (!Number.isFinite(qty) || !Number.isFinite(buy)) return sum;
    return sum + qty * buy;
  }, 0);
}

export async function getCogsTotal(
  shopId: string,
  from?: Date | null,
  to?: Date | null
) {
  const { start, end } = ensureBoundedRange(from, to);

  const rows = await prisma.$queryRaw<
    { sum: Prisma.Decimal | number | null }[]
  >(Prisma.sql`
    SELECT
      SUM(CAST(si.quantity AS numeric) * COALESCE(p.buy_price, 0)) AS sum
    FROM "sale_items" si
    JOIN "sales" s ON s.id = si.sale_id
    JOIN "products" p ON p.id = si.product_id
    WHERE s.shop_id = CAST(${shopId} AS uuid)
      AND s.status <> 'VOIDED'
      AND s.sale_date >= ${start}
      AND s.sale_date <= ${end}
  `);

  const raw = rows[0]?.sum ?? 0;
  return Number(raw);
}

export async function getCogsByDay(
  shopId: string,
  from?: Date | null,
  to?: Date | null
) {
  const { start, end } = ensureBoundedRange(from, to);

  const rows = await prisma.$queryRaw<
    { day: Date; sum: Prisma.Decimal | number | null }[]
  >(Prisma.sql`
    SELECT
      DATE(s.sale_date) AS day,
      SUM(CAST(si.quantity AS numeric) * COALESCE(p.buy_price, 0)) AS sum
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

function parseDateRange(from?: string, to?: string) {
  return parseTimestampRange(from, to);
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
export async function getSalesSummary(
  shopId: string,
  from?: string,
  to?: string
) {
  const user = await requireUser();
  await assertShopAccess(shopId, user);
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
export async function getExpenseSummary(
  shopId: string,
  from?: string,
  to?: string
) {
  const user = await requireUser();
  await assertShopAccess(shopId, user);
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
export async function getCashSummary(
  shopId: string,
  from?: string,
  to?: string
) {
  const user = await requireUser();
  await assertShopAccess(shopId, user);
  const parsed = parseTimestampRange(from, to);
  const useUnbounded = !from && !to;
  const { start, end } = useUnbounded
    ? { start: undefined, end: undefined }
    : clampRange(parsed.start, parsed.end, 90);
  const [inAgg, outAgg] = await Promise.all([
    prisma.cashEntry.aggregate({
      where: {
        shopId,
        entryType: "IN",
        createdAt: {
          gte: start ?? undefined,
          lte: end ?? undefined,
        },
      },
      _sum: { amount: true },
    }),
    prisma.cashEntry.aggregate({
      where: {
        shopId,
        entryType: "OUT",
        createdAt: {
          gte: start ?? undefined,
          lte: end ?? undefined,
        },
      },
      _sum: { amount: true },
    }),
  ]);

  const totalIn = Number(inAgg._sum.amount ?? 0);
  const totalOut = Number(outAgg._sum.amount ?? 0);

  const balance = totalIn - totalOut;

  return {
    totalIn,
    totalOut,
    balance,
  };
}
export async function getProfitSummary(
  shopId: string,
  from?: string,
  to?: string
) {
  const user = await requireUser();
  await assertShopAccess(shopId, user);
  const { start, end } = parseTimestampRange(from, to);
  const fallbackDays = !from && !to ? 3650 : 30;
  const bounded = ensureBoundedRange(start, end, fallbackDays);

  const rangeFrom = bounded.start.toISOString();
  const rangeTo = bounded.end.toISOString();

  // Fetch shop type and sales/expense data in parallel (not sequential)
  const [salesData, expenseData, needsCogs] = await Promise.all([
    getSalesSummary(shopId, rangeFrom, rangeTo),
    getExpenseSummary(shopId, rangeFrom, rangeTo),
    shopNeedsCogs(shopId),
  ]);

  // Only fetch COGS if needed
  const cogs = needsCogs
    ? await getCogsTotal(shopId, bounded.start, bounded.end)
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
