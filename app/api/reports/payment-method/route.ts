// app/api/reports/payment-method/route.ts

import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { sales } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const shopId = searchParams.get("shopId")!;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;

  // fetch sales for this shop (no date filter yet, optional)
  const rows = await db.select().from(sales).where(eq(sales.shopId, shopId));

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
