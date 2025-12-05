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
      expenseDate: parsed.expenseDate || new Date().toISOString().slice(0, 10),
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
      expenseDate: parsed.expenseDate || new Date().toISOString().slice(0, 10),
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
