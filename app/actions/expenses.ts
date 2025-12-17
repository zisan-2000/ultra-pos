// app/actions/expenses.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { expenseSchema } from "@/lib/validators/expense";
import { requirePermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";

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
  requirePermission(user, "create_expense");
  await assertShopAccess(parsed.shopId, user);

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
  requirePermission(user, "update_expense");
  await assertShopAccess(parsed.shopId, user);

  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) {
    throw new Error("Expense not found");
  }
  if (existing.shopId !== parsed.shopId) {
    throw new Error("Unauthorized access to this expense");
  }

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
  requirePermission(user, "view_expenses");
  await assertShopAccess(shopId, user);

  return prisma.expense.findMany({
    where: { shopId },
  });
}

// -------------------------------------------------
// GET SINGLE EXPENSE
// -------------------------------------------------
export async function getExpense(id: string) {
  const user = await requireUser();
  requirePermission(user, "view_expenses");

  const expense = await prisma.expense.findUnique({
    where: { id },
  });

  if (!expense) {
    throw new Error("Expense not found");
  }

  await assertShopAccess(expense.shopId, user);

  return expense;
}

// -------------------------------------------------
// DELETE EXPENSE
// -------------------------------------------------
export async function deleteExpense(id: string) {
  const user = await requireUser();
  requirePermission(user, "delete_expense");

  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense) {
    throw new Error("Expense not found");
  }

  await assertShopAccess(expense.shopId, user);

  await prisma.expense.delete({ where: { id } });
  return { success: true };
}
