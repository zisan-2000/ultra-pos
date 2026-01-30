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
  const lowStockProducts = await prisma.product.findMany({
    where: {
      shopId,
      isActive: true,
      trackStock: true,
      stockQty: {
        lte: threshold,
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
