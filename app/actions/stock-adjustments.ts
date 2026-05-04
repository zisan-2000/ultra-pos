"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";

export type StockAdjustmentInput = {
  shopId: string;
  productId: string;
  variantId?: string | null;
  newQty: number;
  reason: string;
  note?: string | null;
};

export async function createStockAdjustment(input: StockAdjustmentInput) {
  const user = await requireUser();
  requirePermission(user, "update_product");
  await assertShopAccess(input.shopId, user);

  if (!input.productId) throw new Error("Product ID required");
  if (!input.reason) throw new Error("Reason required");
  if (!Number.isFinite(input.newQty) || input.newQty < 0) {
    throw new Error("পরিমাণ অবশ্যই 0 বা তার বেশি হতে হবে");
  }

  await prisma.$transaction(async (tx) => {
    let previousQty: number;

    if (input.variantId) {
      const variant = await tx.productVariant.findUniqueOrThrow({
        where: { id: input.variantId },
        select: { stockQty: true },
      });
      previousQty = Number(variant.stockQty);

      await tx.productVariant.update({
        where: { id: input.variantId },
        data: { stockQty: input.newQty.toFixed(2) },
      });
    } else {
      const product = await tx.product.findUniqueOrThrow({
        where: { id: input.productId },
        select: { stockQty: true, trackStock: true },
      });
      if (!product.trackStock) {
        throw new Error("এই পণ্যে স্টক ট্র্যাকিং চালু নেই");
      }
      previousQty = Number(product.stockQty);

      await tx.product.update({
        where: { id: input.productId },
        data: { stockQty: input.newQty.toFixed(2) },
      });
    }

    const quantityChange = input.newQty - previousQty;

    await tx.stockAdjustment.create({
      data: {
        shopId: input.shopId,
        productId: input.productId,
        variantId: input.variantId ?? null,
        reason: input.reason,
        note: input.note?.trim() || null,
        quantityChange: quantityChange.toFixed(2),
        previousQty: previousQty.toFixed(2),
        newQty: input.newQty.toFixed(2),
      },
    });
  });

  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/products/adjustments");

  return { success: true };
}

export async function getStockAdjustmentsByShop(shopId: string, limit = 500) {
  const user = await requireUser();
  requirePermission(user, "view_products");
  await assertShopAccess(shopId, user);

  const rows = await prisma.stockAdjustment.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      reason: true,
      note: true,
      quantityChange: true,
      previousQty: true,
      newQty: true,
      createdAt: true,
      product: { select: { id: true, name: true } },
      variant: { select: { label: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    reason: r.reason,
    note: r.note ?? null,
    quantityChange: r.quantityChange.toString(),
    previousQty: r.previousQty.toString(),
    newQty: r.newQty.toString(),
    createdAt: r.createdAt.toISOString(),
    productId: r.product.id,
    productName: r.product.name,
    variantLabel: r.variant?.label ?? null,
  }));
}
