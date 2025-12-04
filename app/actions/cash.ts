// app/actions/cash.ts

"use server";

import { db } from "@/db/client";
import { cashEntries, shops } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { createServerClientForRoute } from "@/lib/supabase";
import { cashSchema } from "@/lib/validators/cash";

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
    throw new Error("Unauthorized access");
  }

  return shop;
}

// -------------------------------------------------
// CREATE CASH ENTRY
// -------------------------------------------------
export async function createCashEntry(input: any) {
  const parsed = cashSchema.parse(input);

  const user = await getCurrentUser();
  await assertShopBelongsToUser(parsed.shopId, user.id);

  await db.insert(cashEntries).values({
    shopId: parsed.shopId,
    entryType: parsed.entryType,
    amount: parsed.amount,
    reason: parsed.reason || "",
  });

  return { success: true };
}

// -------------------------------------------------
// UPDATE CASH ENTRY
// -------------------------------------------------
export async function updateCashEntry(id: string, input: any) {
  const parsed = cashSchema.parse(input);

  const user = await getCurrentUser();
  await assertShopBelongsToUser(parsed.shopId, user.id);

  await db
    .update(cashEntries)
    .set({
      entryType: parsed.entryType,
      amount: parsed.amount,
      reason: parsed.reason || "",
    })
    .where(eq(cashEntries.id, id));

  return { success: true };
}

// -------------------------------------------------
// GET ALL CASH ENTRIES FOR SHOP
// -------------------------------------------------
export async function getCashByShop(shopId: string) {
  const user = await getCurrentUser();
  await assertShopBelongsToUser(shopId, user.id);

  return db.select().from(cashEntries).where(eq(cashEntries.shopId, shopId));
}

// -------------------------------------------------
// GET SINGLE ENTRY
// -------------------------------------------------
export async function getCashEntry(id: string) {
  return db.query.cashEntries.findFirst({
    where: eq(cashEntries.id, id),
  });
}

// -------------------------------------------------
// DELETE ENTRY
// -------------------------------------------------
export async function deleteCashEntry(id: string) {
  await db.delete(cashEntries).where(eq(cashEntries.id, id));
  return { success: true };
}
