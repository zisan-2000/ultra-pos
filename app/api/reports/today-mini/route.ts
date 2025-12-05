import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function startOfTodayUtc() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const shopId = searchParams.get("shopId");

  if (!shopId) {
    return NextResponse.json({ error: "shopId missing" }, { status: 400 });
  }

  const todayStart = startOfTodayUtc();
  const todayDate = todayStart.toISOString().slice(0, 10);

  const salesRows = await prisma.sale.findMany({
    where: { shopId, saleDate: { gte: todayStart } },
  });

  const expenseRows = await prisma.expense.findMany({
    where: { shopId, expenseDate: { gte: todayDate } },
  });

  const cashRows = await prisma.cashEntry.findMany({
    where: { shopId, createdAt: { gte: todayStart } },
  });

  return NextResponse.json({
    sales: salesRows,
    expenses: expenseRows,
    cash: cashRows,
  });
}
