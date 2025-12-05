// app/api/reports/sales/route.ts

import { NextResponse } from "next/server";
import { getSalesWithFilter } from "@/app/actions/reports";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;

  const shopId = params.get("shopId");
  const from = params.get("from") || undefined;
  const to = params.get("to") || undefined;

  if (!shopId) {
    return NextResponse.json({ error: "shopId is required" }, { status: 400 });
  }

  const rows = await getSalesWithFilter(shopId, from, to);
  return NextResponse.json({ rows });
}
