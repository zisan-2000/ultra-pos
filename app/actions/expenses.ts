// app/actions/expenses.ts

"use server";

import { db } from "@/db/client";
import { expenses, shops } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { createServerClientForRoute } from "@/lib/supabase";
import { expenseSchema } from "@/lib/validators/expense";

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

// -------------------------------------------------
// CREATE EXPENSE
// -------------------------------------------------
export async function createExpense(input: any) {
  const parsed = expenseSchema.parse(input);

  const user = await getCurrentUser();
  await assertShopBelongsToUser(parsed.shopId, user.id);

  await db.insert(expenses).values({
    shopId: parsed.shopId,
    amount: parsed.amount,
    category: parsed.category,
    expenseDate: parsed.expenseDate || new Date().toISOString().slice(0, 10),
    note: parsed.note || "",
  });

  return { success: true };
}

// -------------------------------------------------
// UPDATE EXPENSE
// -------------------------------------------------
export async function updateExpense(id: string, input: any) {
  const parsed = expenseSchema.parse(input);

  const user = await getCurrentUser();
  await assertShopBelongsToUser(parsed.shopId, user.id);

  await db
    .update(expenses)
    .set({
      amount: parsed.amount,
      category: parsed.category,
      note: parsed.note || "",
      expenseDate: parsed.expenseDate || new Date().toISOString().slice(0, 10),
    })
    .where(eq(expenses.id, id));

  return { success: true };
}

// -------------------------------------------------
// GET EXPENSES BY SHOP
// -------------------------------------------------
export async function getExpensesByShop(shopId: string) {
  const user = await getCurrentUser();
  await assertShopBelongsToUser(shopId, user.id);

  return db.select().from(expenses).where(eq(expenses.shopId, shopId));
}

// -------------------------------------------------
// GET SINGLE EXPENSE
// -------------------------------------------------
export async function getExpense(id: string) {
  return db.query.expenses.findFirst({
    where: eq(expenses.id, id),
  });
}

// -------------------------------------------------
// DELETE EXPENSE
// -------------------------------------------------
export async function deleteExpense(id: string) {
  await db.delete(expenses).where(eq(expenses.id, id));
  return { success: true };
}
