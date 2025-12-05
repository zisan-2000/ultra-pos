// app/api/sync/products/route.ts

import { NextResponse } from "next/server";
import { getProductsByShop } from "@/app/actions/products";

export async function GET(req: Request) {
  const shopId = new URL(req.url).searchParams.get("shopId");

  if (!shopId) {
    return NextResponse.json({ error: "shopId is required" }, { status: 400 });
  }

  const rows = await getProductsByShop(shopId);
  return NextResponse.json({ rows });
}
