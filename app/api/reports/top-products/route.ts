import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { saleItems, products, sales } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const shopId = searchParams.get("shopId")!;
  const limit = Number(searchParams.get("limit") || 10);

  // fetch all sale items + joined product info + sale info
  const rows = await db
    .select({
      productId: saleItems.productId,
      quantity: saleItems.quantity,
      unitPrice: saleItems.unitPrice,
      name: products.name,
      shopId: products.shopId,
    })
    .from(saleItems)
    .leftJoin(products, eq(products.id, saleItems.productId));

  // filter products of this shop only
  const filtered = rows.filter((r: any) => r.shopId === shopId);

  // group by product
  const map: Record<string, { name: string; qty: number; revenue: number }> =
    {};

  filtered.forEach((item: any) => {
    if (!map[item.productId]) {
      map[item.productId] = {
        name: item.name,
        qty: 0,
        revenue: 0,
      };
    }

    const qty = Number(item.quantity);
    const price = Number(item.unitPrice);

    map[item.productId].qty += qty;
    map[item.productId].revenue += qty * price;
  });

  // convert map to array & sort
  const result = Object.values(map)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit);

  return NextResponse.json({ data: result });
}
