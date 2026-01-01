// app/api/reports/payment-method/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";

function parseTimestampRange(from?: string, to?: string) {
  const startDate = from ? new Date(from) : undefined;
  const endDate = to ? new Date(to) : undefined;

  const start =
    startDate && !Number.isNaN(startDate.getTime()) ? startDate : undefined;
  const end = endDate && !Number.isNaN(endDate.getTime()) ? endDate : undefined;

  if (start) start.setUTCHours(0, 0, 0, 0);
  if (end) end.setUTCHours(23, 59, 59, 999);

  return { start, end };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;

    if (!shopId) {
      return NextResponse.json({ error: "shopId required" }, { status: 400 });
    }

    await assertShopAccess(shopId, user);

    const { start, end } = parseTimestampRange(from, to);

    const sales = await prisma.sale.groupBy({
      by: ["paymentMethod"],
      where: {
        shopId,
        status: { not: "VOIDED" },
        saleDate: {
          gte: start,
          lte: end,
        },
      },
      _sum: {
        totalAmount: true,
      },
      _count: {
        id: true,
      },
    });

    const data = sales.map((s) => ({
      name: s.paymentMethod || "নগদ",
      value: Number(s._sum.totalAmount || 0),
      count: s._count.id,
    }));

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("Payment method report error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
