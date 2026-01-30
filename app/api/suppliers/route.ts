import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupplier } from "@/app/actions/suppliers";

const bodySchema = z.object({
  shopId: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
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
    const result = await createSupplier(parsed.data);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to create supplier" },
      { status: 500 }
    );
  }
}
