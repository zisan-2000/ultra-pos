import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCogsTotal } from "@/app/actions/reports";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";
import { withTracing } from "@/lib/tracing";
import { getDhakaDayRange } from "@/lib/dhaka-date";

const SHOP_TYPES_WITH_COGS = new Set([
  "mini_grocery",
  "pharmacy",
  "clothing",
  "cosmetics_gift",
  "mini_wholesale",
]);

export async function GET(req: Request) {
  return withTracing(req, "/api/reports/today-summary", async () => {
    try {
      const { searchParams } = new URL(req.url);
      const shopId = searchParams.get("shopId");

      if (!shopId) {
        return NextResponse.json({ error: "shopId missing" }, { status: 400 });
      }

      const user = await requireUser();
      await assertShopAccess(shopId, user);

      const { start: todayStart, end: todayEnd } = getDhakaDayRange();

      const shop = await prisma.shop.findUnique({ where: { id: shopId } });
      const needsCogs = shop
        ? SHOP_TYPES_WITH_COGS.has((shop as any).businessType)
        : false;

      const salesRows = await prisma.sale.findMany({
        where: {
          shopId,
          status: { not: "VOIDED" },
          saleDate: { gte: todayStart, lte: todayEnd },
        },
      });

      const salesTotal = salesRows.reduce(
        (sum, s) => sum + Number(s.totalAmount || 0),
        0
      );

      // Expenses (use Date range instead of string to avoid Prisma validation error)
      const expenseRows = await prisma.expense.findMany({
        where: { shopId, expenseDate: { gte: todayStart, lte: todayEnd } },
      });

      const expenseTotal = expenseRows.reduce((sum, e) => sum + Number(e.amount || 0), 0);

      const cogsTotal = needsCogs
        ? await getCogsTotal(shopId, todayStart, todayEnd)
        : 0;

      // Cashbook
      const cashRows = await prisma.cashEntry.findMany({
        where: { shopId, createdAt: { gte: todayStart, lte: todayEnd } },
      });

      const totalIn = cashRows
        .filter((c) => c.entryType === "IN")
        .reduce((sum, c) => sum + Number(c.amount || 0), 0);

      const totalOut = cashRows
        .filter((c) => c.entryType === "OUT")
        .reduce((sum, c) => sum + Number(c.amount || 0), 0);

      const balance = totalIn - totalOut;
      const totalExpense = expenseTotal + cogsTotal;

      return NextResponse.json({
        sales: {
          total: Number(salesTotal.toFixed(2)) || 0,
          count: salesRows.length,
        },
        expenses: {
          total: Number(totalExpense.toFixed(2)) || 0,
          count: expenseRows.length,
          cogs: Number(cogsTotal.toFixed(2)) || 0,
        },
        profit: Number((salesTotal - totalExpense).toFixed(2)) || 0,
        cash: {
          in: Number(totalIn.toFixed(2)) || 0,
          out: Number(totalOut.toFixed(2)) || 0,
          balance: Number(balance.toFixed(2)) || 0,
          count: cashRows.length,
        },
      });
    } catch (error) {
      console.error("today-summary error", error);
      return NextResponse.json(
        { error: "Failed to build summary" },
        { status: 500 }
      );
    }
  });
}
