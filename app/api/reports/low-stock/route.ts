// app/api/reports/low-stock/route.ts

import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { products } from "@/db/schema";
import { and, asc, eq, lte } from "drizzle-orm";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const shopId = searchParams.get("shopId") || "";
  const threshold = Number(searchParams.get("limit") || 10); // stock threshold

  if (!shopId) {
    return NextResponse.json(
      { data: [], error: "shopId missing" },
      { status: 400 }
    );
  }

  // guard: non-number threshold -> default 10
  const thresholdValue = Number.isFinite(threshold) ? threshold : 10;
  const thresholdParam = thresholdValue.toFixed(2);

  // Fetch low stock items already filtered/sorted in DB
  const rows = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.shopId, shopId),
        eq(products.isActive, true),
        lte(products.stockQty, thresholdParam)
      )
    )
    .orderBy(asc(products.stockQty))
    .limit(50); // cap result set

  // normalize numeric fields as numbers for the client
  const normalized = rows.map((p) => ({
    ...p,
    stockQty: Number(p.stockQty),
  }));

  return NextResponse.json({ data: normalized });
}
