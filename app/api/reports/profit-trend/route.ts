// app/api/reports/profit-trend/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";

function parseTimestampRange(from?: string, to?: string) {
  const isDateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const parse = (value?: string, mode?: "start" | "end") => {
    if (!value) return undefined;
    if (isDateOnly(value)) {
      const tzOffset = "+06:00";
      const iso =
        mode === "end"
          ? `${value}T23:59:59.999${tzOffset}`
          : `${value}T00:00:00.000${tzOffset}`;
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? undefined : d;
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return undefined;
    return d;
  };
  return { start: parse(from, "start"), end: parse(to, "end") };
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
    const useUnbounded = !from && !to;

    // Get all sales
    const sales = await prisma.sale.findMany({
      where: {
        shopId,
        status: { not: "VOIDED" },
        saleDate: useUnbounded
          ? undefined
          : {
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
        expenseDate: useUnbounded
          ? undefined
          : {
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

    const dhakaKey = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Dhaka",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);

    sales.forEach((sale) => {
      const dateKey = dhakaKey(new Date(sale.saleDate));
      const current = salesByDate.get(dateKey) || 0;
      salesByDate.set(dateKey, current + Number(sale.totalAmount));
    });

    expenses.forEach((expense) => {
      const dateKey = dhakaKey(new Date(expense.expenseDate));
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
