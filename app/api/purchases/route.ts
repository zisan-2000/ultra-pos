import { NextResponse } from "next/server";
import { z } from "zod";
import { createPurchase } from "@/app/actions/purchases";

const itemSchema = z.object({
  productId: z.string().min(1),
  qty: z.union([z.string(), z.number()]),
  unitCost: z.union([z.string(), z.number()]),
});

const bodySchema = z.object({
  shopId: z.string().min(1),
  items: z.array(itemSchema).min(1),
  purchaseDate: z.string().optional(),
  supplierId: z.string().optional().nullable(),
  supplierName: z.string().optional().nullable(),
  paymentMethod: z.enum(["cash", "due"]).optional(),
  paidNow: z.union([z.string(), z.number()]).optional().nullable(),
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

    const result = await createPurchase(parsed.data);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to create purchase" },
      { status: 500 }
    );
  }
}
