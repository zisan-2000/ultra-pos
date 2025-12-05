// app/api/reports/today-summary/route.ts

import { NextResponse } from "next/server";
import { getTodaySummary } from "@/app/actions/reports";

export async function GET(req: Request) {
  const shopId = new URL(req.url).searchParams.get("shopId");

  if (!shopId) {
    return NextResponse.json({ error: "shopId is required" }, { status: 400 });
  }

  const data = await getTodaySummary(shopId);
  return NextResponse.json(data);
}
