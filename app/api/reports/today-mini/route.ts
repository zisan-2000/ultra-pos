// app/api/reports/today-mini/route.ts

import { NextResponse } from "next/server";
import { getTodayMiniSummary } from "@/app/actions/reports";

export async function GET(req: Request) {
  const shopId = new URL(req.url).searchParams.get("shopId");

  if (!shopId) {
    return NextResponse.json({ error: "shopId is required" }, { status: 400 });
  }

  const data = await getTodayMiniSummary(shopId);
  return NextResponse.json(data);
}
