import { NextResponse } from "next/server";
import { z } from "zod";
import { createCashEntry } from "@/app/actions/cash";

const bodySchema = z.object({
  shopId: z.string().min(1),
  entryType: z.enum(["IN", "OUT"]).default("IN"),
  amount: z.union([z.string(), z.number()]),
  reason: z.string().optional().nullable(),
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

    await createCashEntry({
      shopId: parsed.data.shopId,
      entryType: parsed.data.entryType,
      amount: parsed.data.amount,
      reason: parsed.data.reason || "",
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to create cash entry" },
      { status: 500 }
    );
  }
}

