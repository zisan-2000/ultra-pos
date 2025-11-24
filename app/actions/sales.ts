// app/actions/sales.ts

"use server";

import { db } from "@/db/client";
import { sales, saleItems, shops, products } from "@/db/schema";
import { cookies } from "next/headers";
import { createServerClientForRoute } from "@/lib/supabase";
import { eq, inArray } from "drizzle-orm";

type CartItemInput = {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
};

type CreateSaleInput = {
  shopId: string;
  items: CartItemInput[];
  paymentMethod: string;
  note?: string | null;
};

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

// ------------------------------
// CREATE SALE
// ------------------------------
export async function createSale(input: CreateSaleInput) {
  const user = await getCurrentUser();
  await assertShopBelongsToUser(input.shopId, user.id);

  if (!input.items || input.items.length === 0) {
    throw new Error("Cart is empty");
  }

  // Product IDs
  const productIds = input.items.map((i) => i.productId);

  const dbProducts = await db
    .select()
    .from(products)
    .where(inArray(products.id, productIds));

  if (dbProducts.length !== productIds.length) {
    throw new Error("Some products not found");
  }

  // Validate each item
  let computedTotal = 0;

  for (const item of input.items) {
    const p = dbProducts.find((dp) => dp.id === item.productId);

    if (!p) throw new Error("Product not found");

    if (p.shopId !== input.shopId) {
      throw new Error("Product does not belong to this shop");
    }

    if (!p.isActive) {
      throw new Error("Inactive product in cart");
    }

    const stock = Number(p.stockQty || "0");
    if (stock < item.qty) {
      throw new Error(`Not enough stock for ${item.name}`);
    }

    computedTotal += item.unitPrice * item.qty;
  }

  const totalStr = computedTotal.toFixed(2); // numeric as string

  // Insert sale
  const inserted = await db
    .insert(sales)
    .values({
      shopId: input.shopId,
      totalAmount: totalStr,
      paymentMethod: input.paymentMethod || "cash",
      note: input.note || null,
    })
    .returning({ id: sales.id });

  const saleId = inserted[0].id;

  // Insert sale items
  const saleItemRows = input.items.map((item) => ({
    saleId,
    productId: item.productId,
    quantity: item.qty.toString(),
    unitPrice: item.unitPrice.toFixed(2),
  }));

  await db.insert(saleItems).values(saleItemRows);

  // Update stock
  for (const p of dbProducts) {
    const soldQty = input.items
      .filter((i) => i.productId === p.id)
      .reduce((sum, i) => sum + i.qty, 0);

    if (soldQty === 0) continue;

    const currentStock = Number(p.stockQty || "0");
    const newStock = currentStock - soldQty;

    await db
      .update(products)
      .set({ stockQty: newStock.toFixed(2) })
      .where(eq(products.id, p.id));
  }

  return { success: true, saleId };
}

// ------------------------------
// GET SALES BY SHOP
// ------------------------------
export async function getSalesByShop(shopId: string) {
  const user = await getCurrentUser();
  await assertShopBelongsToUser(shopId, user.id);

  const rows = await db.select().from(sales).where(eq(sales.shopId, shopId));

  return rows;
}
