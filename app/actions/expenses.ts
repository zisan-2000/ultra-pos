// app/actions/expenses.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { expenseSchema } from "@/lib/validators/expense";

// -------------------------------------------------
// HELPERS
// -------------------------------------------------
async function assertShopBelongsToUser(shopId: string, userId: string) {
  const shop = await prisma.shops.findUnique({
    where: { id: shopId },
  });

  if (!shop || shop.owner_id !== userId) {
    throw new Error("Unauthorized");
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

  await prisma.expenses.create({
    data: {
      shop_id: parsed.shopId,
      amount: parsed.amount,
      category: parsed.category,
      expense_date: parsed.expenseDate
        ? new Date(parsed.expenseDate)
        : new Date(),
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

  await prisma.expenses.update({
    where: { id },
    data: {
      amount: parsed.amount,
      category: parsed.category,
      note: parsed.note || "",
      expense_date: parsed.expenseDate
        ? new Date(parsed.expenseDate)
        : new Date(),
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

  return prisma.expenses.findMany({
    where: { shop_id: shopId },
    orderBy: { expense_date: "desc" },
  });
}

// -------------------------------------------------
// GET SINGLE EXPENSE
// -------------------------------------------------
export async function getExpense(id: string) {
  return prisma.expenses.findUnique({
    where: { id },
  });
}

// -------------------------------------------------
// DELETE EXPENSE
// -------------------------------------------------
export async function deleteExpense(id: string) {
  const expense = await prisma.expenses.findUnique({
    where: { id },
  });

  if (!expense) throw new Error("Expense not found");

  const user = await requireUser();
  await assertShopBelongsToUser(expense.shop_id, user.id);

  await prisma.expenses.delete({
    where: { id },
  });

  return { success: true };
}
