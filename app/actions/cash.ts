"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";
import { cashSchema } from "@/lib/validators/cash";
import { requirePermission } from "@/lib/rbac";

// -------------------------------------------------
// CREATE CASH ENTRY
// -------------------------------------------------
export async function createCashEntry(input: any) {
  const parsed = cashSchema.parse(input);

  const user = await requireUser();
  requirePermission(user, "create_cash_entry");
  await assertShopAccess(parsed.shopId, user);

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
  requirePermission(user, "update_cash_entry");
  await assertShopAccess(parsed.shopId, user);

  const existing = await prisma.cashEntry.findUnique({ where: { id } });
  if (!existing) {
    throw new Error("Cash entry not found");
  }
  if (existing.shopId !== parsed.shopId) {
    throw new Error("Unauthorized access to this cash entry");
  }

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
  requirePermission(user, "view_cashbook");
  await assertShopAccess(shopId, user);

  return prisma.cashEntry.findMany({
    where: { shopId },
  });
}

// -------------------------------------------------
// GET SINGLE ENTRY
// -------------------------------------------------
export async function getCashEntry(id: string) {
  const user = await requireUser();
  requirePermission(user, "view_cashbook");

  const entry = await prisma.cashEntry.findUnique({
    where: { id },
  });

  if (!entry) {
    throw new Error("Cash entry not found");
  }

  await assertShopAccess(entry.shopId, user);

  return entry;
}

// -------------------------------------------------
// DELETE ENTRY
// -------------------------------------------------
export async function deleteCashEntry(id: string) {
  const user = await requireUser();
  requirePermission(user, "delete_cash_entry");

  const entry = await prisma.cashEntry.findUnique({ where: { id } });
  if (!entry) {
    throw new Error("Cash entry not found");
  }

  await assertShopAccess(entry.shopId, user);

  await prisma.cashEntry.delete({ where: { id } });
  return { success: true };
}
