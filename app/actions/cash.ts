// app/actions/cash.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { cashSchema } from "@/lib/validators/cash";

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

// ----------------------------------------------
// CREATE CASH ENTRY
// ----------------------------------------------
export async function createCashEntry(input: any) {
  const parsed = cashSchema.parse(input);

  const user = await requireUser();
  await assertShopBelongsToUser(parsed.shopId, user.id);

  await prisma.cash_entries.create({
    data: {
      shop_id: parsed.shopId,
      entry_type: parsed.entryType,
      amount: parsed.amount,
      reason: parsed.reason || "",
    },
  });

  return { success: true };
}

// ----------------------------------------------
// UPDATE CASH ENTRY
// ----------------------------------------------
export async function updateCashEntry(id: string, input: any) {
  const parsed = cashSchema.parse(input);

  const user = await requireUser();
  await assertShopBelongsToUser(parsed.shopId, user.id);

  await prisma.cash_entries.update({
    where: { id },
    data: {
      entry_type: parsed.entryType,
      amount: parsed.amount,
      reason: parsed.reason || "",
    },
  });

  return { success: true };
}

// ----------------------------------------------
// GET ALL CASH ENTRIES FOR SHOP
// ----------------------------------------------
export async function getCashByShop(shopId: string) {
  const user = await requireUser();
  await assertShopBelongsToUser(shopId, user.id);

  return prisma.cash_entries.findMany({
    where: { shop_id: shopId },
    orderBy: { created_at: "desc" },
  });
}

// ----------------------------------------------
// GET SINGLE ENTRY
// ----------------------------------------------
export async function getCashEntry(id: string) {
  return prisma.cash_entries.findUnique({
    where: { id },
  });
}

// ----------------------------------------------
// DELETE ENTRY
// ----------------------------------------------
export async function deleteCashEntry(id: string) {
  // Must check ownership first
  const entry = await prisma.cash_entries.findUnique({
    where: { id },
  });

  if (!entry) throw new Error("Cash entry not found");

  const user = await requireUser();
  await assertShopBelongsToUser(entry.shop_id, user.id);

  await prisma.cash_entries.delete({
    where: { id },
  });

  return { success: true };
}
