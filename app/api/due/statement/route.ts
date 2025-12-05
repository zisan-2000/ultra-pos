// app/api/due/statement/route.ts

import { NextResponse } from "next/server";
import { getCustomerStatement } from "@/app/actions/customers";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const shopId = params.get("shopId");
  const customerId = params.get("customerId");

  if (!shopId || !customerId) {
    return NextResponse.json(
      { error: "shopId and customerId are required" },
      { status: 400 }
    );
  }

  const data = await getCustomerStatement(shopId, customerId);
  return NextResponse.json({ data });
}
