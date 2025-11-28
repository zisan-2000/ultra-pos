// app/actions/shops.ts

"use server";

import { db } from "@/db/client";
import {
  shops,
  products,
  sales,
  saleItems,
  customers,
  customerLedger,
  expenses,
  cashEntries,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { createServerClientForRoute } from "@/lib/supabase";

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
    throw new Error("Unauthorized");
  }
  return shop;
}

// ------------------------------
// CREATE SHOP
// ------------------------------
export async function createShop(data: {
  name: string;
  address?: string;
  phone?: string;
  businessType?: string;
}) {
  const user = await getCurrentUser();

  await db.insert(shops).values({
    ownerId: user.id,
    name: data.name,
    address: data.address || "",
    phone: data.phone || "",
    businessType: data.businessType || "tea_stall",
  });

  return { success: true };
}

// ------------------------------
// GET SHOPS BY USER
// ------------------------------
export async function getShopsByUser() {
  const user = await getCurrentUser();
  return db.select().from(shops).where(eq(shops.ownerId, user.id));
}

// ------------------------------
// GET SINGLE SHOP
// ------------------------------
export async function getShop(id: string) {
  const user = await getCurrentUser();
  const shop = await db.query.shops.findFirst({
    where: eq(shops.id, id),
  });
  if (!shop || shop.ownerId !== user.id) throw new Error("Unauthorized");
  return shop;
}

// ------------------------------
// UPDATE SHOP
// ------------------------------
export async function updateShop(id: string, data: any) {
  const user = await getCurrentUser();
  await assertShopBelongsToUser(id, user.id);
  await db.update(shops).set(data).where(eq(shops.id, id));
  return { success: true };
}

// ------------------------------
// DELETE SHOP
// ------------------------------
export async function deleteShop(id: string) {
  const user = await getCurrentUser();
  await assertShopBelongsToUser(id, user.id);

  const saleIdRows = await db
    .select({ id: sales.id })
    .from(sales)
    .where(eq(sales.shopId, id));
  const saleIds = saleIdRows.map((r) => r.id);

  const productIdRows = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.shopId, id));
  const productIds = productIdRows.map((r) => r.id);

  if (saleIds.length) {
    await db.delete(saleItems).where(inArray(saleItems.saleId, saleIds));
  }
  if (productIds.length) {
    await db.delete(saleItems).where(inArray(saleItems.productId, productIds));
  }

  await db.delete(customerLedger).where(eq(customerLedger.shopId, id));
  await db.delete(expenses).where(eq(expenses.shopId, id));
  await db.delete(cashEntries).where(eq(cashEntries.shopId, id));
  await db.delete(sales).where(eq(sales.shopId, id));
  await db.delete(customers).where(eq(customers.shopId, id));
  await db.delete(products).where(eq(products.shopId, id));
  await db.delete(shops).where(eq(shops.id, id));

  return { success: true };
}
