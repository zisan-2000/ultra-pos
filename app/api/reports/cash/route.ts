// app/api/reports/cash/route.ts

import { NextResponse } from "next/server";
import { getCashWithFilter } from "@/app/actions/reports";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const shopId = searchParams.get("shopId")!;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;

  const rows = await getCashWithFilter(shopId, from, to);

  return NextResponse.json({ rows });
}
