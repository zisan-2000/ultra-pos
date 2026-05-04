import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const shopId = searchParams.get("shopId");
    const productId = searchParams.get("productId");
    const variantId = searchParams.get("variantId") ?? null;

    if (!shopId || !productId) {
      return NextResponse.json(
        { success: false, error: "shopId and productId are required" },
        { status: 400 }
      );
    }

    const user = await requireUser();
    await assertShopAccess(shopId, user);

    const serials = await prisma.serialNumber.findMany({
      where: {
        shopId,
        productId,
        ...(variantId ? { variantId } : {}),
        status: "IN_STOCK",
      },
      select: { id: true, serialNo: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, serials });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed" },
      { status: 500 }
    );
  }
}
