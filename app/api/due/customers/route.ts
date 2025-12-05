// app/api/due/customers/route.ts

import { NextResponse } from "next/server";
import { createCustomer, getCustomersByShop } from "@/app/actions/customers";

export async function GET(req: Request) {
  const shopId = new URL(req.url).searchParams.get("shopId");

  if (!shopId) {
    return NextResponse.json({ error: "shopId is required" }, { status: 400 });
  }

  const rows = await getCustomersByShop(shopId);
  return NextResponse.json({ data: rows });
}

export async function POST(req: Request) {
  const { shopId, name, phone, address } = await req.json();

  if (!shopId || !name) {
    return NextResponse.json(
      { error: "shopId and name are required" },
      { status: 400 }
    );
  }

  const result = await createCustomer({ shopId, name, phone, address });
  return NextResponse.json({ success: true, id: result.id });
}
