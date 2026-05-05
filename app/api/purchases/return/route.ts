import { NextResponse } from "next/server";
import { z } from "zod";
import { createPurchaseReturn } from "@/app/actions/purchases";
import { apiErrorResponse } from "@/lib/http/api-errors";

const itemSchema = z.object({
  purchaseItemId: z.string().min(1),
  qty: z.union([z.string(), z.number()]),
  serialNumbers: z.array(z.string().min(1).max(120)).optional().nullable(),
});

const bodySchema = z.object({
  shopId: z.string().min(1),
  purchaseId: z.string().min(1),
  items: z.array(itemSchema).min(1),
  returnDate: z.string().optional(),
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

    const result = await createPurchaseReturn(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
