// app/actions/products.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";

// ----------------------------------------------
// TYPES
// ----------------------------------------------
export type CreateProductInput = {
  shopId: string;
  name: string;
  category?: string;
  buyPrice?: string | number | null;
  sellPrice: string | number;
  stockQty?: string | number;
  isActive?: boolean;
  trackStock?: boolean;
};

export type UpdateProductInput = {
  name?: string;
  category?: string;
  buyPrice?: string | number | null;
  sellPrice?: string | number;
  stockQty?: string | number;
  isActive?: boolean;
  trackStock?: boolean;
};

// ----------------------------------------------
// HELPERS
// ----------------------------------------------
async function assertShopBelongsToUser(shopId: string, userId: string) {
  const shop = await prisma.shops.findUnique({
    where: { id: shopId },
  });

  if (!shop || shop.owner_id !== userId) {
    throw new Error("Unauthorized");
  }

  return shop;
}

function parseDecimal(value: string | number | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const num = Number(value);
  if (Number.isNaN(num)) throw new Error("Invalid number");

  return num;
}

// ----------------------------------------------
// CREATE PRODUCT
// ----------------------------------------------
export async function createProduct(input: CreateProductInput) {
  const user = await requireUser();
  await assertShopBelongsToUser(input.shopId, user.id);

  const buyPrice = parseDecimal(input.buyPrice);
  const sellPrice = parseDecimal(input.sellPrice);
  const stockQty = input.trackStock ? parseDecimal(input.stockQty ?? 0) : 0;

  await prisma.products.create({
    data: {
      shop_id: input.shopId,
      name: input.name,
      category: input.category || "Uncategorized",
      buy_price: buyPrice ?? null,
      sell_price: sellPrice!,
      stock_qty: stockQty!,
      is_active: input.isActive ?? true,
      track_stock: input.trackStock ?? false,
    },
  });

  return { success: true };
}

// ----------------------------------------------
// GET PRODUCTS BY SHOP
// ----------------------------------------------
export async function getProductsByShop(shopId: string) {
  const user = await requireUser();
  await assertShopBelongsToUser(shopId, user.id);

  return prisma.products.findMany({
    where: { shop_id: shopId },
    orderBy: { created_at: "desc" },
  });
}

// ----------------------------------------------
// GET SINGLE PRODUCT
// ----------------------------------------------
export async function getProduct(id: string) {
  const user = await requireUser();

  const product = await prisma.products.findUnique({
    where: { id },
  });

  if (!product) throw new Error("Product not found");

  await assertShopBelongsToUser(product.shop_id, user.id);

  return product;
}

// ----------------------------------------------
// UPDATE PRODUCT
// ----------------------------------------------
export async function updateProduct(id: string, data: UpdateProductInput) {
  const user = await requireUser();

  const product = await prisma.products.findUnique({
    where: { id },
  });

  if (!product) throw new Error("Product not found");

  await assertShopBelongsToUser(product.shop_id, user.id);

  const buyPrice = parseDecimal(data.buyPrice);
  const sellPrice =
    data.sellPrice !== undefined ? parseDecimal(data.sellPrice) : undefined;
  const stockQty =
    data.stockQty !== undefined ? parseDecimal(data.stockQty) : undefined;

  const trackStock = data.trackStock ?? product.track_stock;

  const finalStockQty = trackStock ? stockQty : 0;

  await prisma.products.update({
    where: { id },
    data: {
      name: data.name ?? product.name,
      category: data.category ?? product.category,
      buy_price: buyPrice !== undefined ? buyPrice : product.buy_price,
      sell_price: sellPrice !== undefined ? sellPrice : product.sell_price,
      stock_qty: finalStockQty ?? product.stock_qty,
      is_active: data.isActive ?? product.is_active,
      track_stock: trackStock,
    },
  });

  return { success: true };
}

// ----------------------------------------------
// DELETE PRODUCT
// ----------------------------------------------
export async function deleteProduct(id: string) {
  const user = await requireUser();

  const product = await prisma.products.findUnique({
    where: { id },
  });

  if (!product) throw new Error("Product not found");

  await assertShopBelongsToUser(product.shop_id, user.id);

  await prisma.products.delete({
    where: { id },
  });

  return { success: true };
}

// ----------------------------------------------
// ACTIVE PRODUCTS (POS USE)
// ----------------------------------------------
export async function getActiveProductsByShop(shopId: string) {
  const user = await requireUser();
  await assertShopBelongsToUser(shopId, user.id);

  return prisma.products.findMany({
    where: {
      shop_id: shopId,
      is_active: true,
    },
    orderBy: { name: "asc" },
  });
}
