// app/api/reports/sales/route.ts

import { NextResponse } from "next/server";
import { getSalesWithFilter } from "@/app/actions/reports";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const shopId = searchParams.get("shopId")!;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;

  const rows = await getSalesWithFilter(shopId, from, to);

  return NextResponse.json({ rows });
}
