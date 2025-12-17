import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const shopId = searchParams.get("shopId")!;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;

  const user = await requireUser();
  await assertShopAccess(shopId, user);

  const rows = await prisma.sale.findMany({
    where: {
      shopId,
      saleDate: {
        gte: from ? new Date(from) : undefined,
        lte: to ? new Date(to) : undefined,
      },
    },
  });

  // payment method grouping
  const grouped: Record<string, number> = {};

  rows.forEach((s: any) => {
    const method = s.paymentMethod || "cash";
    if (!grouped[method]) grouped[method] = 0;
    grouped[method] += Number(s.totalAmount);
  });

  const data = Object.entries(grouped).map(([name, value]) => ({
    name,
    value,
  }));

  return NextResponse.json({ data });
}
