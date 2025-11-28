// app/actions/sales.ts

"use server";

import { db } from "@/db/client";
import {
  sales,
  saleItems,
  shops,
  products,
  customers,
  customerLedger,
} from "@/db/schema";
import { cookies } from "next/headers";
import { createServerClientForRoute } from "@/lib/supabase";
import { and, eq, inArray, sql } from "drizzle-orm";

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
  customerId?: string | null;
  paidNow?: number | null;
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

// TEMP: ensure new columns exist in case migration hasn't been applied yet.
async function ensureTrackStockColumn() {
  await db.execute(
    sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "track_stock" boolean NOT NULL DEFAULT false`
  );
}

// ------------------------------
// CREATE SALE
// ------------------------------
export async function createSale(input: CreateSaleInput) {
  await ensureTrackStockColumn();

  const user = await getCurrentUser();
  await assertShopBelongsToUser(input.shopId, user.id);

  if (!input.items || input.items.length === 0) {
    throw new Error("Cart is empty");
  }

  let dueCustomer: { id: string } | null = null;
  if (input.paymentMethod === "due") {
    if (!input.customerId) {
      throw new Error("Select a customer for due sale");
    }

    const c = await db.query.customers.findFirst({
      where: eq(customers.id, input.customerId),
      columns: { id: true, shopId: true },
    });

    if (!c || c.shopId !== input.shopId) {
      throw new Error("Customer not found for this shop");
    }

    dueCustomer = { id: c.id };
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

    computedTotal += item.unitPrice * item.qty;
  }

  const totalStr = computedTotal.toFixed(2); // numeric as string

  // Insert sale
  const inserted = await db
    .insert(sales)
    .values({
      shopId: input.shopId,
      customerId: input.customerId || null,
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

    // Only update stock when this product is tracking inventory
    if (p.trackStock === false) continue;

    const currentStock = Number(p.stockQty || "0");
    const newStock = currentStock - soldQty;

    await db
      .update(products)
      .set({ stockQty: newStock.toFixed(2) })
      .where(eq(products.id, p.id));
  }

  // Record due entry if needed
  if (dueCustomer) {
    const total = Number(totalStr);
    const payNowRaw = Number(input.paidNow || 0);
    const payNow = Math.min(Math.max(payNowRaw, 0), total); // clamp 0..total
    const dueAmount = Number((total - payNow).toFixed(2));

    await db.transaction(async (tx) => {
      await tx.insert(customerLedger).values({
        shopId: input.shopId,
        customerId: dueCustomer!.id,
        entryType: "SALE",
        amount: totalStr,
        description: input.note || "Due sale",
      });

      if (payNow > 0) {
        await tx.insert(customerLedger).values({
          shopId: input.shopId,
          customerId: dueCustomer!.id,
          entryType: "PAYMENT",
          amount: payNow.toFixed(2),
          description: "Partial payment at sale",
        });
      }

      await tx
        .update(customers)
        .set({
          totalDue: sql`${customers.totalDue} + ${dueAmount.toFixed(2)}`,
          lastPaymentAt: payNow > 0 ? new Date() : undefined,
        })
        .where(eq(customers.id, dueCustomer!.id));
    });
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

  if (rows.length === 0) return [];

  const saleIds = rows.map((r: any) => r.id);

  const items = await db
    .select({
      saleId: saleItems.saleId,
      productName: products.name,
      qty: saleItems.quantity,
    })
    .from(saleItems)
    .leftJoin(products, eq(products.id, saleItems.productId))
    .where(inArray(saleItems.saleId, saleIds));

  const itemSummaryMap: Record<
    string,
    { count: number; preview: string; names: string[] }
  > = {};

  for (const it of items as any[]) {
    const entry = itemSummaryMap[it.saleId] || {
      count: 0,
      names: [],
      preview: "",
    };
    entry.count += 1;
    if (entry.names.length < 3 && it.productName) {
      entry.names.push(`${it.productName} x${Number(it.qty || 0)}`);
    }
    itemSummaryMap[it.saleId] = entry;
  }

  const customerIds = Array.from(
    new Set(
      rows
        .map((r: any) => r.customerId)
        .filter((id: any): id is string => Boolean(id))
    )
  );

  let customerMap: Record<string, string> = {};
  if (customerIds.length) {
    const cs = await db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(and(eq(customers.shopId, shopId), inArray(customers.id, customerIds)));

    customerMap = Object.fromEntries(cs.map((c: any) => [c.id, c.name]));
  }

  return rows.map((r: any) => {
    const summary = itemSummaryMap[r.id] || { count: 0, names: [] };
    return {
      ...r,
      itemCount: summary.count,
      itemPreview: summary.names.join(", "),
      customerName: r.customerId ? customerMap[r.customerId] : null,
    };
  });
}
