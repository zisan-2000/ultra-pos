"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { cashSchema } from "@/lib/validators/cash";

async function assertShopBelongsToUser(shopId: string, userId: string) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });

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

  const user = await requireUser();
  await assertShopBelongsToUser(parsed.shopId, user.id);

  await prisma.cashEntry.create({
    data: {
      shopId: parsed.shopId,
      entryType: parsed.entryType,
      amount: parsed.amount,
      reason: parsed.reason || "",
    },
  });

  return { success: true };
}

// -------------------------------------------------
// UPDATE CASH ENTRY
// -------------------------------------------------
export async function updateCashEntry(id: string, input: any) {
  const parsed = cashSchema.parse(input);

  const user = await requireUser();
  await assertShopBelongsToUser(parsed.shopId, user.id);

  await prisma.cashEntry.update({
    where: { id },
    data: {
      entryType: parsed.entryType,
      amount: parsed.amount,
      reason: parsed.reason || "",
    },
  });

  return { success: true };
}

// -------------------------------------------------
// GET ALL CASH ENTRIES FOR SHOP
// -------------------------------------------------
export async function getCashByShop(shopId: string) {
  const user = await requireUser();
  await assertShopBelongsToUser(shopId, user.id);

  return prisma.cashEntry.findMany({
    where: { shopId },
  });
}

// -------------------------------------------------
// GET SINGLE ENTRY
// -------------------------------------------------
export async function getCashEntry(id: string) {
  return prisma.cashEntry.findUnique({
    where: { id },
  });
}

// -------------------------------------------------
// DELETE ENTRY
// -------------------------------------------------
export async function deleteCashEntry(id: string) {
  await prisma.cashEntry.delete({ where: { id } });
  return { success: true };
}
