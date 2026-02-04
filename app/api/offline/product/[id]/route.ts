import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireUser();
    requirePermission(user, "view_products");

    const product = await prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await assertShopAccess(product.shopId, user);

    return NextResponse.json({
      id: product.id,
      shopId: product.shopId,
      name: product.name,
      category: product.category,
      buyPrice: product.buyPrice?.toString?.() ?? null,
      sellPrice: product.sellPrice?.toString?.() ?? "0",
      stockQty: product.stockQty?.toString?.() ?? "0",
      isActive: product.isActive,
      trackStock: product.trackStock,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt?.toISOString?.() ?? product.createdAt.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
