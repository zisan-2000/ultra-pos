// app/api/due/payment/route.ts

import { NextResponse } from "next/server";
import { recordCustomerPayment } from "@/app/actions/customers";

export async function POST(req: Request) {
  const { shopId, customerId, amount, description } = await req.json();

  if (!shopId || !customerId || !amount) {
    return NextResponse.json(
      { error: "shopId, customerId, amount are required" },
      { status: 400 }
    );
  }

  await recordCustomerPayment({
    shopId,
    customerId,
    amount: Number(amount),
    description,
  });

  return NextResponse.json({ success: true });
}
