// app/api/reports/profit-trend/route.ts

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";
import { REPORTS_CACHE_TAGS } from "@/lib/reports/cache-tags";
import { shopNeedsCogs } from "@/lib/accounting/cogs";
import { jsonWithEtag } from "@/lib/http/etag";
import { parseDhakaDateOnlyRange } from "@/lib/dhaka-date";
import {
  isReportRangeValidationError,
  validateBoundedReportRange,
} from "@/lib/reporting-config";

const parseDateRange = (from?: string, to?: string) =>
  parseDhakaDateOnlyRange(from, to, true);

async function computeProfitTrend(
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
      returnWhere.push(Prisma.sql` sr.business_date >= CAST(${startDate} AS date)`);
    }
    if (endDate) {
      salesWhere.push(Prisma.sql` s.business_date <= CAST(${endDate} AS date)`);
      returnWhere.push(Prisma.sql` sr.business_date <= CAST(${endDate} AS date)`);
    }
    if (startDate) {
      expenseWhere.push(Prisma.sql` e.expense_date >= CAST(${startDate} AS date)`);
    }
    if (endDate) {
      expenseWhere.push(Prisma.sql` e.expense_date <= CAST(${endDate} AS date)`);
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
        GROUP BY day
        ORDER BY day
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
  salesRows.forEach((row) => {
    salesByDate.set(row.day, Number(row.sum ?? 0));
  });

  const expensesByDate = new Map<string, number>();
  expenseRows.forEach((row) => {
    expensesByDate.set(row.day, Number(row.sum ?? 0));
  });

  const salesCogsByDate = new Map<string, number>();
  cogsRows.forEach((row) => {
    salesCogsByDate.set(row.day, Number(row.sum ?? 0));
  });

  const allDates = new Set<string>([
    ...salesByDate.keys(),
    ...expensesByDate.keys(),
    ...salesCogsByDate.keys(),
  ]);

  return Array.from(allDates)
    .sort()
    .map((date) => {
      const sales = Number(salesByDate.get(date) || 0);
      const operatingExpense = Number(expensesByDate.get(date) || 0);
      const cogs = needsCogs ? Number(salesCogsByDate.get(date) || 0) : 0;
      const grossProfit = sales - cogs;
      const netProfit = grossProfit - operatingExpense;
      const totalExpense = operatingExpense + cogs;
      const grossMarginPct = sales ? (grossProfit / sales) * 100 : 0;
      const netMarginPct = sales ? (netProfit / sales) * 100 : 0;

      return {
        date,
        sales: Number(sales.toFixed(2)),
        expense: Number(totalExpense.toFixed(2)),
        operatingExpense: Number(operatingExpense.toFixed(2)),
        cogs: Number(cogs.toFixed(2)),
        grossProfit: Number(grossProfit.toFixed(2)),
        netProfit: Number(netProfit.toFixed(2)),
        grossMarginPct: Number(grossMarginPct.toFixed(2)),
        netMarginPct: Number(netMarginPct.toFixed(2)),
      };
    });
}

const getProfitTrendCached = unstable_cache(
  async (shopId: string, from?: string, to?: string) =>
    computeProfitTrend(shopId, from, to),
  ["reports-profit-trend"],
  { revalidate: 60, tags: [REPORTS_CACHE_TAGS.profitTrend] }
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
    const validated = validateBoundedReportRange(from, to);

    await assertShopAccess(shopId, user);
    const data = fresh
      ? await computeProfitTrend(shopId, validated.from, validated.to)
      : await getProfitTrendCached(shopId, validated.from, validated.to);
    return jsonWithEtag(request, { data }, {
      cacheControl: "private, no-cache",
    });
  } catch (error: any) {
    if (isReportRangeValidationError(error)) {
      return NextResponse.json(
        { error: error.message, code: "INVALID_REPORT_RANGE" },
        { status: error.status }
      );
    }
    console.error("Profit trend report error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
