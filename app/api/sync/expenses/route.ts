// app/api/sync/expenses/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type IncomingExpense = {
  id?: string;
  shopId: string;
  amount: string | number;
  category: string;
  note?: string | null;
  expenseDate?: string | number | Date;
  createdAt?: number | string;
};

function toMoney(value: string | number) {
  const num = Number(value);
  if (!Number.isFinite(num)) throw new Error("Invalid amount");
  return num.toFixed(2);
}

function toDate(value?: number | string | Date) {
  const d = value ? new Date(value) : new Date();
  if (!Number.isFinite(d.getTime())) return new Date();
  return d;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { newItems = [], updatedItems = [], deletedIds = [] } = body || {};

    if (Array.isArray(newItems) && newItems.length > 0) {
      const data = newItems.map((item: IncomingExpense) => ({
        id: item.id,
        shopId: item.shopId,
        amount: toMoney(item.amount),
        category: item.category || "Uncategorized",
        note: item.note || "",
        expenseDate: toDate(item.expenseDate),
        createdAt: toDate(item.createdAt ?? item.expenseDate),
      }));

      await prisma.expense.createMany({
        data,
        skipDuplicates: true,
      });
    }

    if (Array.isArray(updatedItems) && updatedItems.length > 0) {
      for (const item of updatedItems as IncomingExpense[]) {
        if (!item.id) continue;
        await prisma.expense.update({
          where: { id: item.id },
          data: {
            amount: toMoney(item.amount),
            category: item.category || "Uncategorized",
            note: item.note || "",
            expenseDate: toDate(item.expenseDate),
          },
        });
      }
    }

    if (Array.isArray(deletedIds) && deletedIds.length > 0) {
      await prisma.expense.deleteMany({
        where: { id: { in: deletedIds as string[] } },
      });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Expense sync failed", e);
    return NextResponse.json(
      { success: false, error: e?.message || "Sync failed" },
      { status: 500 }
    );
  }
}
