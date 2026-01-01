// app/api/reports/profit-trend/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";

function parseTimestampRange(from?: string, to?: string) {
  const startDate = from ? new Date(from) : undefined;
  const endDate = to ? new Date(to) : undefined;

  const start =
    startDate && !Number.isNaN(startDate.getTime()) ? startDate : undefined;
  const end = endDate && !Number.isNaN(endDate.getTime()) ? endDate : undefined;

  if (start) start.setUTCHours(0, 0, 0, 0);
  if (end) end.setUTCHours(23, 59, 59, 999);

  return { start, end };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;

    if (!shopId) {
      return NextResponse.json({ error: "shopId required" }, { status: 400 });
    }

    await assertShopAccess(shopId, user);

    const { start, end } = parseTimestampRange(from, to);

    // Get all sales
    const sales = await prisma.sale.findMany({
      where: {
        shopId,
        status: { not: "VOIDED" },
        saleDate: {
          gte: start,
          lte: end,
        },
      },
      select: {
        saleDate: true,
        totalAmount: true,
      },
    });

    // Get all expenses
    const expenses = await prisma.expense.findMany({
      where: {
        shopId,
        expenseDate: {
          gte: start,
          lte: end,
        },
      },
      select: {
        expenseDate: true,
        amount: true,
      },
    });

    // Group by date manually
    const salesByDate = new Map<string, number>();
    const expensesByDate = new Map<string, number>();

    sales.forEach((sale) => {
      const dateKey = new Date(sale.saleDate).toISOString().split("T")[0];
      const current = salesByDate.get(dateKey) || 0;
      salesByDate.set(dateKey, current + Number(sale.totalAmount));
    });

    expenses.forEach((expense) => {
      const dateKey = new Date(expense.expenseDate).toISOString().split("T")[0];
      const current = expensesByDate.get(dateKey) || 0;
      expensesByDate.set(dateKey, current + Number(expense.amount));
    });

    // Get all unique dates
    const allDates = new Set([
      ...Array.from(salesByDate.keys()),
      ...Array.from(expensesByDate.keys()),
    ]);

    const data = Array.from(allDates)
      .sort()
      .map((date) => ({
        date,
        sales: salesByDate.get(date) || 0,
        expense: expensesByDate.get(date) || 0,
      }));

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("Profit trend report error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
