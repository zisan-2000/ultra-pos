import { NextResponse } from "next/server";
import { recordCustomerPayment } from "@/app/actions/customers";
import { apiErrorResponse } from "@/lib/http/api-errors";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { shopId, customerId, amount, description } = body || {};

    if (!shopId || !customerId || !amount) {
      return NextResponse.json(
        { error: "shopId, customerId and amount are required" },
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
  } catch (error) {
    return apiErrorResponse(error);
  }
}
