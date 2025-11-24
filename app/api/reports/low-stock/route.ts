import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { products } from "@/db/schema";
import { eq, lte } from "drizzle-orm";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const shopId = searchParams.get("shopId")!;
  const limit = Number(searchParams.get("limit") || 10); // threshold

  // fetch products for this shop
  const rows = await db
    .select()
    .from(products)
    .where(eq(products.shopId, shopId));

  // filter low stock items
  const lowStock = rows
    .filter((p: any) => Number(p.stockQty) <= limit)
    .sort((a, b) => Number(a.stockQty) - Number(b.stockQty));

  return NextResponse.json({ data: lowStock });
}
