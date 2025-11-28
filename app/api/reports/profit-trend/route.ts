import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { sales, expenses, shops } from "@/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { getCogsByDay } from "@/app/actions/reports";

function parseRange(from?: string | null, to?: string | null) {
  const start = from ? new Date(from) : undefined;
  const end = to ? new Date(to) : undefined;

  if (start) start.setUTCHours(0, 0, 0, 0);
  if (end) end.setUTCHours(23, 59, 59, 999);

  return { start, end };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const shopId = searchParams.get("shopId")!;
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const { start, end } = parseRange(from, to);
  const startDateOnly = start ? start.toISOString().split("T")[0] : undefined;
  const endDateOnly = end ? end.toISOString().split("T")[0] : undefined;

  const salesRows = await db
    .select()
    .from(sales)
    .where(
      and(
        eq(sales.shopId, shopId),
        start ? gte(sales.saleDate, start) : undefined,
        end ? lte(sales.saleDate, end) : undefined
      )
    );

  const expenseRows = await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.shopId, shopId),
        startDateOnly ? gte(expenses.expenseDate, startDateOnly) : undefined,
        endDateOnly ? lte(expenses.expenseDate, endDateOnly) : undefined
      )
    );

  const format = (d: string | Date) => new Date(d).toISOString().split("T")[0];

  const map: Record<string, { sales: number; expense: number }> = {};

  salesRows.forEach((s: any) => {
    const day = format(s.saleDate);
    if (!map[day]) map[day] = { sales: 0, expense: 0 };
    map[day].sales += Number(s.totalAmount);
  });

  expenseRows.forEach((e: any) => {
    const day = format(e.expenseDate);
    if (!map[day]) map[day] = { sales: 0, expense: 0 };
    map[day].expense += Number(e.amount);
  });

  const shop = await db.query.shops.findFirst({
    where: eq(shops.id, shopId),
  });
  const needsCogs =
    shop &&
    new Set([
      "mini_grocery",
      "pharmacy",
      "clothing",
      "cosmetics_gift",
      "mini_wholesale",
    ]).has((shop as any).businessType);

  if (needsCogs) {
    const cogsByDay = await getCogsByDay(shopId, start ?? undefined, end ?? undefined);
    Object.entries(cogsByDay).forEach(([day, cogs]) => {
      if (!map[day]) map[day] = { sales: 0, expense: 0 };
      map[day].expense += cogs;
    });
  }

  const data = Object.entries(map).map(([date, v]) => ({
    date,
    sales: v.sales,
    expense: v.expense,
  }));

  return NextResponse.json({ data });
}
