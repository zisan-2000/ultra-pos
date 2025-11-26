"use server";

import { db } from "@/db/client";
import {
  customers,
  customerLedger,
  shops,
} from "@/db/schema";
import { cookies } from "next/headers";
import { createServerClientForRoute } from "@/lib/supabase";
import { and, desc, eq, sql } from "drizzle-orm";

type CreateCustomerInput = {
  shopId: string;
  name: string;
  phone?: string | null;
  address?: string | null;
};

type PaymentInput = {
  shopId: string;
  customerId: string;
  amount: number;
  description?: string | null;
};

/* --------------------------------------------------
   AUTH HELPERS
-------------------------------------------------- */
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

async function assertCustomerInShop(customerId: string, shopId: string) {
  const row = await db.query.customers.findFirst({
    where: and(eq(customers.id, customerId), eq(customers.shopId, shopId)),
  });

  if (!row) {
    throw new Error("Customer not found in this shop");
  }

  return row;
}

/* --------------------------------------------------
   CREATE CUSTOMER
-------------------------------------------------- */
export async function createCustomer(input: CreateCustomerInput) {
  const user = await getCurrentUser();
  await assertShopBelongsToUser(input.shopId, user.id);

  const name = input.name?.trim();
  if (!name) throw new Error("Name is required");

  const inserted = await db
    .insert(customers)
    .values({
      shopId: input.shopId,
      name,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
    })
    .returning({ id: customers.id });

  return { id: inserted[0].id };
}

/* --------------------------------------------------
   LIST CUSTOMERS (WITH DUE)
-------------------------------------------------- */
export async function getCustomersByShop(shopId: string) {
  const user = await getCurrentUser();
  await assertShopBelongsToUser(shopId, user.id);

  const rows = await db
    .select()
    .from(customers)
    .where(eq(customers.shopId, shopId))
    .orderBy(desc(customers.totalDue));

  return rows;
}

/* --------------------------------------------------
   ADD DUE (SALE) ENTRY
-------------------------------------------------- */
export async function addDueSaleEntry(input: {
  shopId: string;
  customerId: string;
  amount: number;
  description?: string | null;
}) {
  const user = await getCurrentUser();
  await assertShopBelongsToUser(input.shopId, user.id);
  const customer = await assertCustomerInShop(input.customerId, input.shopId);

  const amount = Number(input.amount || 0);
  if (!amount || amount <= 0) throw new Error("Amount must be positive");

  await db.transaction(async (tx) => {
    await tx.insert(customerLedger).values({
      shopId: input.shopId,
      customerId: input.customerId,
      entryType: "SALE",
      amount: amount.toFixed(2),
      description: input.description || "Due sale",
    });

    await tx
      .update(customers)
      .set({
        totalDue: sql`${customers.totalDue} + ${amount.toFixed(2)}`,
      })
      .where(eq(customers.id, customer.id));
  });

  return { success: true };
}

/* --------------------------------------------------
   RECORD PAYMENT
-------------------------------------------------- */
export async function recordCustomerPayment(input: PaymentInput) {
  const user = await getCurrentUser();
  await assertShopBelongsToUser(input.shopId, user.id);
  const customer = await assertCustomerInShop(input.customerId, input.shopId);

  const amount = Number(input.amount || 0);
  if (!amount || amount <= 0) throw new Error("Amount must be positive");

  await db.transaction(async (tx) => {
    await tx.insert(customerLedger).values({
      shopId: input.shopId,
      customerId: input.customerId,
      entryType: "PAYMENT",
      amount: amount.toFixed(2),
      description: input.description || "Payment",
    });

    const newDue = Math.max(0, Number(customer.totalDue || 0) - amount);

    await tx
      .update(customers)
      .set({
        totalDue: newDue.toFixed(2),
        lastPaymentAt: new Date(),
      })
      .where(eq(customers.id, customer.id));
  });

  return { success: true };
}

/* --------------------------------------------------
   CUSTOMER STATEMENT
-------------------------------------------------- */
export async function getCustomerStatement(
  shopId: string,
  customerId: string
) {
  const user = await getCurrentUser();
  await assertShopBelongsToUser(shopId, user.id);
  await assertCustomerInShop(customerId, shopId);

  const rows = await db
    .select()
    .from(customerLedger)
    .where(
      and(
        eq(customerLedger.shopId, shopId),
        eq(customerLedger.customerId, customerId)
      )
    )
    .orderBy(customerLedger.entryDate);

  return rows;
}

/* --------------------------------------------------
   DUE SUMMARY (SHOP)
-------------------------------------------------- */
export async function getDueSummary(shopId: string) {
  const user = await getCurrentUser();
  await assertShopBelongsToUser(shopId, user.id);

  const rows = await db
    .select()
    .from(customers)
    .where(eq(customers.shopId, shopId))
    .orderBy(desc(customers.totalDue));

  const totalDue = rows.reduce(
    (sum, c: any) => sum + Number(c.totalDue || 0),
    0
  );

  const topDue = rows.slice(0, 5).map((c) => ({
    id: c.id,
    name: c.name,
    totalDue: Number(c.totalDue || 0),
    phone: c.phone,
  }));

  return { totalDue, topDue, customers: rows };
}
