// app/api/reports/profit-trend/route.ts

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";

function parseTimestampRange(from?: string, to?: string) {
  const isDateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const parse = (value?: string, mode?: "start" | "end") => {
    if (!value) return undefined;
    if (isDateOnly(value)) {
      const tzOffset = "+06:00";
      const iso =
        mode === "end"
          ? `${value}T23:59:59.999${tzOffset}`
          : `${value}T00:00:00.000${tzOffset}`;
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? undefined : d;
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return undefined;
    return d;
  };
  return { start: parse(from, "start"), end: parse(to, "end") };
}

function parseDateOnlyRange(from?: string, to?: string) {
  const isDateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const parse = (value?: string, mode?: "start" | "end") => {
    if (!value) return undefined;
    if (isDateOnly(value)) {
      const iso =
        mode === "end"
          ? `${value}T23:59:59.999Z`
          : `${value}T00:00:00.000Z`;
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? undefined : d;
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return undefined;
    if (mode === "start") d.setUTCHours(0, 0, 0, 0);
    if (mode === "end") d.setUTCHours(23, 59, 59, 999);
    return d;
  };
  return { start: parse(from, "start"), end: parse(to, "end") };
}

async function computeProfitTrend(
  shopId: string,
  from?: string,
  to?: string
) {
  const { start, end } = parseTimestampRange(from, to);
  const { start: expenseStart, end: expenseEnd } = parseDateOnlyRange(from, to);
  const useUnbounded = !from && !to;

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
    }
    if (end) {
      salesWhere.push(Prisma.sql` s.sale_date <= ${end}`);
    }
    if (expenseStart) {
      expenseWhere.push(Prisma.sql` e.expense_date >= ${expenseStart}`);
    }
    if (expenseEnd) {
      expenseWhere.push(Prisma.sql` e.expense_date <= ${expenseEnd}`);
    }
  }

  const [salesRows, expenseRows] = await Promise.all([
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
  ]);

  const salesByDate = new Map<string, number>();
  salesRows.forEach((row) => {
    salesByDate.set(row.day, Number(row.sum ?? 0));
  });

  const expensesByDate = new Map<string, number>();
  expenseRows.forEach((row) => {
    expensesByDate.set(row.day, Number(row.sum ?? 0));
  });

  const allDates = new Set<string>([
    ...salesByDate.keys(),
    ...expensesByDate.keys(),
  ]);

  return Array.from(allDates)
    .sort()
    .map((date) => ({
      date,
      sales: salesByDate.get(date) || 0,
      expense: expensesByDate.get(date) || 0,
    }));
}

const getProfitTrendCached = unstable_cache(
  async (shopId: string, from?: string, to?: string) =>
    computeProfitTrend(shopId, from, to),
  ["reports-profit-trend"],
  { revalidate: 60 }
);

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;
    const fresh = searchParams.get("fresh") === "1";

    if (!shopId) {
      return NextResponse.json({ error: "shopId required" }, { status: 400 });
    }

    await assertShopAccess(shopId, user);
    const data = fresh
      ? await computeProfitTrend(shopId, from, to)
      : await getProfitTrendCached(shopId, from, to);
    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("Profit trend report error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
