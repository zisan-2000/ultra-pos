// app/api/due/summary/route.ts

import { NextResponse } from "next/server";
import { getDueSummary } from "@/app/actions/customers";

export async function GET(req: Request) {
  const shopId = new URL(req.url).searchParams.get("shopId");

  if (!shopId) {
    return NextResponse.json({ error: "shopId is required" }, { status: 400 });
  }

  const summary = await getDueSummary(shopId);
  return NextResponse.json(summary);
}
