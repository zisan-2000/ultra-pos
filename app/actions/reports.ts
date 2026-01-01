// app/actions/reports.ts

"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
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

    // Otherwise assume ISO timestamp and clamp to UTC day boundaries.
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return undefined;
    if (mode === "start") d.setUTCHours(0, 0, 0, 0);
    if (mode === "end") d.setUTCHours(23, 59, 59, 999);
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
  endDate.setUTCHours(23, 59, 59, 999);

  const startDate = start
    ? new Date(start)
    : new Date(endDate.getTime() - fallbackDays * 24 * 60 * 60 * 1000);
  startDate.setUTCHours(0, 0, 0, 0);

  return { start: startDate, end: endDate };
}

function clampRange(start?: Date | null, end?: Date | null, maxDays = 90) {
  const bounded = ensureBoundedRange(start, end, maxDays);
  const maxWindowMs = maxDays * 24 * 60 * 60 * 1000;
  const delta = bounded.end.getTime() - bounded.start.getTime();
  if (delta > maxWindowMs) {
    const clampedStart = new Date(bounded.end.getTime() - maxWindowMs);
    clampedStart.setUTCHours(0, 0, 0, 0);
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

function normalizeLimit(limit?: number | null, defaultLimit = 200) {
  const n = Number(limit);
  if (!Number.isFinite(n)) return defaultLimit;
  return Math.max(1, Math.min(n, 500));
}

/* --------------------------------------------------
   SALES LIST WITH DATE FILTER
-------------------------------------------------- */
export async function getSalesWithFilter(
  shopId: string,
  from?: string,
  to?: string,
  limit?: number
) {
  const user = await requireUser();
  await assertShopAccess(shopId, user);
  const safeLimit = normalizeLimit(limit);
  const parsed = parseTimestampRange(from, to);
  const useUnbounded = !from && !to;
  const { start, end } = useUnbounded
    ? { start: undefined, end: undefined }
    : clampRange(parsed.start, parsed.end, 90);

  return prisma.sale.findMany({
    where: {
      shopId,
      // exclude voided sales from reports
      status: { not: "VOIDED" },
      saleDate: {
        gte: start ?? undefined,
        lte: end ?? undefined,
      },
    },
    orderBy: [{ saleDate: "desc" }, { id: "desc" }],
    take: safeLimit,
  });
}

/* --------------------------------------------------
   EXPENSE LIST WITH DATE FILTER
-------------------------------------------------- */
export async function getExpensesWithFilter(
  shopId: string,
  from?: string,
  to?: string,
  limit?: number
) {
  const user = await requireUser();
  await assertShopAccess(shopId, user);
  const safeLimit = normalizeLimit(limit);
  const parsed = parseDateRange(from, to);
  const useUnbounded = !from && !to;
  const { start, end } = useUnbounded
    ? { start: undefined, end: undefined }
    : clampRange(parsed.start, parsed.end, 90);

  return prisma.expense.findMany({
    where: {
      shopId,
      expenseDate: {
        gte: start ?? undefined,
        lte: end ?? undefined,
      },
    },
    orderBy: [{ expenseDate: "desc" }, { id: "desc" }],
    take: safeLimit,
  });
}

/* --------------------------------------------------
   CASHBOOK LIST WITH DATE FILTER
-------------------------------------------------- */
export async function getCashWithFilter(
  shopId: string,
  from?: string,
  to?: string,
  limit?: number
) {
  const user = await requireUser();
  await assertShopAccess(shopId, user);
  const safeLimit = normalizeLimit(limit);
  const parsed = parseTimestampRange(from, to);
  const useUnbounded = !from && !to;
  const { start, end } = useUnbounded
    ? { start: undefined, end: undefined }
    : clampRange(parsed.start, parsed.end, 90);

  return prisma.cashEntry.findMany({
    where: {
      shopId,
      createdAt: {
        gte: start ?? undefined,
        lte: end ?? undefined,
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: safeLimit,
  });
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

  const salesData = await getSalesSummary(shopId, rangeFrom, rangeTo);
  const expenseData = await getExpenseSummary(shopId, rangeFrom, rangeTo);
  const needsCogs = await shopNeedsCogs(shopId);
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
