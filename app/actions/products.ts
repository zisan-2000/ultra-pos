// app/actions/products.ts

"use server";

import { db } from "@/db/client";
import { products, shops } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { createServerClientForRoute } from "@/lib/supabase";

// ---------------------------------
// TYPES
// ---------------------------------
type CreateProductInput = {
  shopId: string;
  name: string;
  category: string;
  sellPrice: string;
  stockQty: string;
  isActive: boolean;
};

type UpdateProductInput = {
  name?: string;
  category?: string;
  sellPrice?: string;
  stockQty?: string;
  isActive?: boolean;
};

// ---------------------------------
// AUTH HELPERS
// ---------------------------------
async function getCurrentUser() {
  const cookieStore = await cookies();
  const supabase = createServerClientForRoute(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");
  return user;
}

async function assertShopBelongsToUser(shopId: string, userId: string) {
  const shop = await db.query.shops.findFirst({
    where: eq(shops.id, shopId),
  });

  if (!shop || shop.ownerId !== userId) {
    throw new Error("Unauthorized access to this shop");
  }

  return shop;
}

// ---------------------------------
// CREATE PRODUCT
// ---------------------------------
export async function createProduct(input: CreateProductInput) {
  const user = await getCurrentUser();
  await assertShopBelongsToUser(input.shopId, user.id);

  await db.insert(products).values({
    shopId: input.shopId,
    name: input.name,
    category: input.category || "Uncategorized",
    sellPrice: input.sellPrice,
    stockQty: input.stockQty,
    isActive: input.isActive,
  });

  return { success: true };
}

// ---------------------------------
// GET PRODUCTS BY SHOP
// ---------------------------------
export async function getProductsByShop(shopId: string) {
  const user = await getCurrentUser();
  await assertShopBelongsToUser(shopId, user.id);

  const rows = await db
    .select()
    .from(products)
    .where(eq(products.shopId, shopId));

  return rows;
}

// ---------------------------------
// GET SINGLE PRODUCT
// ---------------------------------
export async function getProduct(id: string) {
  const user = await getCurrentUser();

  const product = await db.query.products.findFirst({
    where: eq(products.id, id),
  });

  if (!product) throw new Error("Product not found");

  await assertShopBelongsToUser(product.shopId, user.id);

  return product;
}

// ---------------------------------
// UPDATE PRODUCT
// ---------------------------------
export async function updateProduct(id: string, data: UpdateProductInput) {
  const product = await db.query.products.findFirst({
    where: eq(products.id, id),
  });

  if (!product) throw new Error("Product not found");

  const user = await getCurrentUser();
  await assertShopBelongsToUser(product.shopId, user.id);

  await db.update(products).set(data).where(eq(products.id, id));

  return { success: true };
}

// ---------------------------------
// DELETE PRODUCT
// ---------------------------------
export async function deleteProduct(id: string) {
  const product = await db.query.products.findFirst({
    where: eq(products.id, id),
  });

  if (!product) throw new Error("Product not found");

  const user = await getCurrentUser();
  await assertShopBelongsToUser(product.shopId, user.id);

  await db.delete(products).where(eq(products.id, id));

  return { success: true };
}

// ---------------------------------
// ACTIVE PRODUCTS (POS)
// ---------------------------------
export async function getActiveProductsByShop(shopId: string) {
  const user = await getCurrentUser();
  await assertShopBelongsToUser(shopId, user.id);

  const rows = await db
    .select()
    .from(products)
    .where(
      and(eq(products.shopId, shopId), eq(products.isActive, true as any))
    );

  return rows;
}
