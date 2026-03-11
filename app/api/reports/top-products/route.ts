// app/api/reports/top-products/route.ts

import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseDhakaDateOnlyRange } from "@/lib/dhaka-date";
import {
  clampReportLimit,
  isReportRangeValidationError,
  validateBoundedReportRange,
} from "@/lib/reporting-config";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";
import { REPORTS_CACHE_TAGS } from "@/lib/reports/cache-tags";
import { jsonWithEtag } from "@/lib/http/etag";

const parseDateRange = (from?: string, to?: string) =>
  parseDhakaDateOnlyRange(from, to, true);

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

  const rows = await prisma.$queryRaw<
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

  const productIds = rows.map((p) => p.product_id);
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

  return rows.map((item) => ({
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

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;
    const limit = clampReportLimit(searchParams.get("limit"));
    const fresh = searchParams.get("fresh") === "1";

    if (!shopId) {
      return NextResponse.json({ error: "shopId required" }, { status: 400 });
    }
    const validated = validateBoundedReportRange(from, to);

    await assertShopAccess(shopId, user);
    const data = fresh
      ? await computeTopProductsReport(
          shopId,
          limit,
          validated.from,
          validated.to
        )
      : await getTopProductsCached(
          shopId,
          limit,
          validated.from,
          validated.to
        );
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
    console.error("Top products report error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
