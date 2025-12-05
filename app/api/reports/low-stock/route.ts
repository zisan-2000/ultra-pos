import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const shopId = searchParams.get("shopId") || "";
  const threshold = Number(searchParams.get("limit") || 10); // stock threshold

  if (!shopId) {
    return NextResponse.json({ data: [], error: "shopId missing" }, { status: 400 });
  }

  // guard: non-number threshold -> default 10
  const thresholdValue = Number.isFinite(threshold) ? threshold : 10;
  const thresholdParam = thresholdValue.toFixed(2);

  const rows = await prisma.product.findMany({
    where: {
      shopId,
      isActive: true,
      stockQty: {
        lte: thresholdParam,
      },
    },
    orderBy: { stockQty: "asc" },
    take: 50,
  });

  // normalize numeric fields as numbers for the client
  const normalized = rows.map((p) => ({
    ...p,
    stockQty: Number(p.stockQty),
  }));

  return NextResponse.json({ data: normalized });
}
