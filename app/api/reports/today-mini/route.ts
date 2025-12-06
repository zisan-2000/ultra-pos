import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function startOfTodayUtc() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfTodayUtc(start: Date) {
  const end = new Date(start);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const shopId = searchParams.get("shopId");

    if (!shopId) {
      return NextResponse.json({ error: "shopId missing" }, { status: 400 });
    }

    const todayStart = startOfTodayUtc();
    const todayEnd = endOfTodayUtc(todayStart);

    const salesRows = await prisma.sale.findMany({
      where: { shopId, saleDate: { gte: todayStart, lte: todayEnd } },
    });

    const expenseRows = await prisma.expense.findMany({
      where: { shopId, expenseDate: { gte: todayStart, lte: todayEnd } },
    });

    const cashRows = await prisma.cashEntry.findMany({
      where: { shopId, createdAt: { gte: todayStart, lte: todayEnd } },
    });

    return NextResponse.json({
      sales: salesRows,
      expenses: expenseRows,
      cash: cashRows,
    });
  } catch (error) {
    console.error("today-mini error", error);
    return NextResponse.json(
      { error: "Failed to load today mini summary" },
      { status: 500 }
    );
  }
}
