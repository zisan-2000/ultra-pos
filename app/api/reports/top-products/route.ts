import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const shopId = searchParams.get("shopId")!;
  const limit = Number(searchParams.get("limit") || 10);

  const items = await prisma.saleItem.findMany({
    where: { sale: { shopId } },
    select: {
      productId: true,
      quantity: true,
      unitPrice: true,
      product: {
        select: {
          name: true,
          shopId: true,
        },
      },
    },
  });

  const map: Record<string, { name: string; qty: number; revenue: number }> = {};

  items
    .filter((item) => item.product?.shopId === shopId)
    .forEach((item) => {
      if (!map[item.productId]) {
        map[item.productId] = {
          name: item.product?.name || "Unknown",
          qty: 0,
          revenue: 0,
        };
      }

      const qty = Number(item.quantity);
      const price = Number(item.unitPrice);

      map[item.productId].qty += qty;
      map[item.productId].revenue += qty * price;
    });

  const result = Object.values(map)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit);

  return NextResponse.json({ data: result });
}
