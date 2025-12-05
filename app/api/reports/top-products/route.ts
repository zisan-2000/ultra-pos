// app/api/reports/top-products/route.ts

import { NextResponse } from "next/server";
import { getTopProducts } from "@/app/actions/reports";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;

  const shopId = params.get("shopId");
  const limit = Number(params.get("limit") || 10);

  if (!shopId) {
    return NextResponse.json({ error: "shopId is required" }, { status: 400 });
  }

  const rows = await getTopProducts(shopId, limit);
  return NextResponse.json({ rows });
}
