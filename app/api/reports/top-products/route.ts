// app/api/reports/top-products/route.ts

import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clampReportLimit } from "@/lib/reporting-config";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";
import { REPORTS_CACHE_TAGS } from "@/lib/reports/cache-tags";
import { jsonWithEtag } from "@/lib/http/etag";

async function computeTopProductsReport(shopId: string, limit: number) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startDate = thirtyDaysAgo.toISOString().slice(0, 10);

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
        WHERE s.shop_id = CAST(${shopId} AS uuid)
          AND s.status <> 'VOIDED'
          AND s.business_date >= CAST(${startDate} AS date)
      ),
      return_lines AS (
        SELECT
          sri.product_id AS product_id,
          -CAST(sri.quantity AS numeric) AS qty_delta,
          -CAST(sri.line_total AS numeric) AS revenue_delta
        FROM "sale_return_items" sri
        JOIN "sale_returns" sr ON sr.id = sri.sale_return_id
        WHERE sr.shop_id = CAST(${shopId} AS uuid)
          AND sr.status = 'completed'
          AND sr.business_date >= CAST(${startDate} AS date)
      ),
      exchange_lines AS (
        SELECT
          srei.product_id AS product_id,
          CAST(srei.quantity AS numeric) AS qty_delta,
          CAST(srei.line_total AS numeric) AS revenue_delta
        FROM "sale_return_exchange_items" srei
        JOIN "sale_returns" sr ON sr.id = srei.sale_return_id
        WHERE sr.shop_id = CAST(${shopId} AS uuid)
          AND sr.status = 'completed'
          AND sr.business_date >= CAST(${startDate} AS date)
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
  async (shopId: string, limit: number) =>
    computeTopProductsReport(shopId, limit),
  ["reports-top-products"],
  { revalidate: 60, tags: [REPORTS_CACHE_TAGS.topProducts] }
);

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");
    const limit = clampReportLimit(searchParams.get("limit"));
    const fresh = searchParams.get("fresh") === "1";

    if (!shopId) {
      return NextResponse.json({ error: "shopId required" }, { status: 400 });
    }

    await assertShopAccess(shopId, user);
    const data = fresh
      ? await computeTopProductsReport(shopId, limit)
      : await getTopProductsCached(shopId, limit);
    return jsonWithEtag(request, { data }, {
      cacheControl: "private, no-cache",
    });
  } catch (error: any) {
    console.error("Top products report error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
