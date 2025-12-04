// app/api/due/statement/route.ts

import { NextResponse } from "next/server";
import { getDueSummary } from "@/app/actions/customers";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const shopId = searchParams.get("shopId");

  if (!shopId) {
    return NextResponse.json({ error: "shopId is required" }, { status: 400 });
  }

  const summary = await getDueSummary(shopId);
  return NextResponse.json(summary);
}
