import { NextResponse } from "next/server";
import { z } from "zod";
import { recordPurchasePayment } from "@/app/actions/purchases";

const bodySchema = z.object({
  shopId: z.string().min(1),
  purchaseId: z.string().min(1),
  amount: z.union([z.string(), z.number()]),
  paidAt: z.string().optional(),
  method: z.string().optional(),
  note: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const raw = await req.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid payload", details: parsed.error.format() },
        { status: 400 }
      );
    }
    const result = await recordPurchasePayment(parsed.data);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to record payment" },
      { status: 500 }
    );
  }
}
