// app/api/reports/low-stock/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clampReportLimit } from "@/lib/reporting-config";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");
    const limit = clampReportLimit(searchParams.get("limit"));

    if (!shopId) {
      return NextResponse.json({ error: "shopId required" }, { status: 400 });
    }

    await assertShopAccess(shopId, user);

    const lowStockProducts = await prisma.product.findMany({
      where: {
        shopId,
        isActive: true,
        trackStock: true,
        stockQty: {
          lte: limit,
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

    const data = lowStockProducts.map((p) => ({
      id: p.id,
      name: p.name,
      stockQty: Number(p.stockQty),
    }));

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("Low stock report error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
