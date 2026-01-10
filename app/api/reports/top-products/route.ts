// app/api/reports/top-products/route.ts

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

    const topProducts = await prisma.saleItem.groupBy({
      by: ["productId"],
      where: {
        sale: {
          shopId,
          status: { not: "VOIDED" },
        },
      },
      _sum: {
        quantity: true,
        lineTotal: true,
      },
      orderBy: {
        _sum: {
          lineTotal: "desc",
        },
      },
      take: limit,
    });

    // Get product names
    const productIds = topProducts.map((p) => p.productId);
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

    const data = topProducts.map((item) => ({
      name: productMap.get(item.productId) || "Unknown",
      qty: Number(item._sum.quantity || 0),
      revenue: Number(item._sum.lineTotal || 0),
    }));

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("Top products report error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
