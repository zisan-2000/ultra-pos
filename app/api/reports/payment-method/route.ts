// app/api/reports/payment-method/route.ts

import { NextResponse } from "next/server";
import { getPaymentMethodSummary } from "@/app/actions/reports";

export async function GET(req: Request) {
  const shopId = new URL(req.url).searchParams.get("shopId");

  if (!shopId) {
    return NextResponse.json({ error: "shopId is required" }, { status: 400 });
  }

  const rows = await getPaymentMethodSummary(shopId);
  return NextResponse.json({ rows });
}
