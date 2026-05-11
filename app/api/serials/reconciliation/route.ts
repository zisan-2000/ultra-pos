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

    const product = await prisma.product.findFirst({
      where: { id: productId, shopId },
      select: {
        id: true,
        stockQty: true,
        trackSerialNumbers: true,
        variants: {
          where: { isActive: true },
          select: { id: true, stockQty: true },
        },
      },
    });

    if (!product) {
      return NextResponse.json(
        { success: false, error: "Product not found in this shop" },
        { status: 404 }
      );
    }

    let stockQty = Number(product.stockQty ?? 0);
    let variantCondition: { variantId?: string | null } = {};

    if (variantId) {
      const variant = product.variants.find((row) => row.id === variantId);
      if (!variant) {
        return NextResponse.json(
          { success: false, error: "Variant not found for this product" },
          { status: 400 }
        );
      }
      stockQty = Number(variant.stockQty ?? 0);
      variantCondition = { variantId };
    } else if (product.variants.length > 0) {
      variantCondition = { variantId: null };
    }

    const serials = product.trackSerialNumbers
      ? await prisma.serialNumber.findMany({
          where: {
            shopId,
            productId,
            ...variantCondition,
            status: "IN_STOCK",
          },
          select: { id: true, serialNo: true, createdAt: true },
          orderBy: [{ createdAt: "asc" }, { serialNo: "asc" }],
        })
      : [];

    return NextResponse.json({
      success: true,
      stockQty,
      trackSerialNumbers: product.trackSerialNumbers,
      serialCount: serials.length,
      serials,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed" },
      { status: 500 }
    );
  }
}
