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

  const salesWhere: Prisma.Sql[] = [
    Prisma.sql` s.shop_id = CAST(${shopId} AS uuid)`,
    Prisma.sql` s.status <> 'VOIDED'`,
  ];
  const expenseWhere: Prisma.Sql[] = [
    Prisma.sql` e.shop_id = CAST(${shopId} AS uuid)`,
  ];

  if (!useUnbounded) {
    if (start) {
      salesWhere.push(Prisma.sql` s.business_date >= ${start}`);
    }
    if (end) {
      salesWhere.push(Prisma.sql` s.business_date <= ${end}`);
    }
    if (start) {
      expenseWhere.push(Prisma.sql` e.expense_date >= ${start}`);
    }
    if (end) {
      expenseWhere.push(Prisma.sql` e.expense_date <= ${end}`);
    }
  }

  const [salesRows, expenseRows, cogsRows] = await Promise.all([
    prisma.$queryRaw<{ day: string; sum: Prisma.Decimal | number | null }[]>(
      Prisma.sql`
        SELECT
          s.business_date::text AS day,
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
              s.business_date::text AS day,
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
