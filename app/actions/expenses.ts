// app/actions/expenses.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { expenseSchema } from "@/lib/validators/expense";

async function assertShopBelongsToUser(shopId: string, userId: string) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });

  if (!shop || shop.ownerId !== userId) {
    throw new Error("Unauthorized access to this shop");
  }

  return shop;
}

function normalizeExpenseDate(raw?: string | null) {
  const trimmed = raw?.trim();
  const date = trimmed ? new Date(trimmed) : new Date();
  if (Number.isNaN(date.getTime())) {
    // fallback to today's date if parsing fails
    const fallback = new Date();
    fallback.setUTCHours(0, 0, 0, 0);
    return fallback;
  }
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

// -------------------------------------------------
// CREATE EXPENSE
// -------------------------------------------------
export async function createExpense(input: any) {
  const parsed = expenseSchema.parse(input);

  const user = await requireUser();
  await assertShopBelongsToUser(parsed.shopId, user.id);

  await prisma.expense.create({
    data: {
      shopId: parsed.shopId,
      amount: parsed.amount,
      category: parsed.category,
      expenseDate: normalizeExpenseDate(parsed.expenseDate),
      note: parsed.note || "",
    },
  });

  return { success: true };
}

// -------------------------------------------------
// UPDATE EXPENSE
// -------------------------------------------------
export async function updateExpense(id: string, input: any) {
  const parsed = expenseSchema.parse(input);

  const user = await requireUser();
  await assertShopBelongsToUser(parsed.shopId, user.id);

  await prisma.expense.update({
    where: { id },
    data: {
      amount: parsed.amount,
      category: parsed.category,
      note: parsed.note || "",
      expenseDate: normalizeExpenseDate(parsed.expenseDate),
    },
  });

  return { success: true };
}

// -------------------------------------------------
// GET EXPENSES BY SHOP
// -------------------------------------------------
export async function getExpensesByShop(shopId: string) {
  const user = await requireUser();
  await assertShopBelongsToUser(shopId, user.id);

  return prisma.expense.findMany({
    where: { shopId },
  });
}

// -------------------------------------------------
// GET SINGLE EXPENSE
// -------------------------------------------------
export async function getExpense(id: string) {
  return prisma.expense.findUnique({
    where: { id },
  });
}

// -------------------------------------------------
// DELETE EXPENSE
// -------------------------------------------------
export async function deleteExpense(id: string) {
  await prisma.expense.delete({ where: { id } });
  return { success: true };
}
