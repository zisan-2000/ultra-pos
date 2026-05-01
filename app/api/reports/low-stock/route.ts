// app/api/reports/low-stock/route.ts

import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { clampReportLimit } from "@/lib/reporting-config";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";
import { REPORTS_CACHE_TAGS } from "@/lib/reports/cache-tags";
import { jsonWithEtag } from "@/lib/http/etag";

function normalizeThreshold(raw?: string | null) {
  const value = Number(raw);
  const allowed = new Set([5, 10, 15, 20]);
  return allowed.has(value) ? value : 20;
}

async function computeLowStockReport(
  shopId: string,
  threshold: number,
  limit: number
) {
  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; stock_qty: string }>>`
    SELECT p.id, p.name, p.stock_qty
    FROM products p
    WHERE p.shop_id = ${shopId}::uuid
      AND p.is_active = true
      AND p.track_stock = true
      AND NOT EXISTS (
        SELECT 1 FROM product_variants pv
        WHERE pv.product_id = p.id AND pv.is_active = true
      )
      AND p.stock_qty <= COALESCE(p.reorder_point, ${threshold})

    UNION ALL

    SELECT p.id,
           p.name || ' (' || pv.label || ')' AS name,
           pv.stock_qty
    FROM products p
    JOIN product_variants pv ON pv.product_id = p.id AND pv.is_active = true
    WHERE p.shop_id = ${shopId}::uuid
      AND p.is_active = true
      AND p.track_stock = true
      AND pv.stock_qty <= COALESCE(p.reorder_point, ${threshold})

    ORDER BY stock_qty ASC
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    stockQty: Number(r.stock_qty),
  }));
}

const getLowStockCached = unstable_cache(
  async (shopId: string, threshold: number, limit: number) =>
    computeLowStockReport(shopId, threshold, limit),
  ["reports-low-stock"],
  { revalidate: 60, tags: [REPORTS_CACHE_TAGS.lowStock] }
);

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");
    const limit = clampReportLimit(searchParams.get("limit"));
    const threshold = normalizeThreshold(searchParams.get("threshold"));
    const fresh = searchParams.get("fresh") === "1";

    if (!shopId) {
      return NextResponse.json({ error: "shopId required" }, { status: 400 });
    }

    await assertShopAccess(shopId, user);
    const data = fresh
      ? await computeLowStockReport(shopId, threshold, limit)
      : await getLowStockCached(shopId, threshold, limit);
    return jsonWithEtag(request, { data }, {
      cacheControl: "private, no-cache",
    });
  } catch (error: any) {
    console.error("Low stock report error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
