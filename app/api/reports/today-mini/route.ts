import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";
import { withTracing } from "@/lib/tracing";
import { getDhakaDateOnlyRange } from "@/lib/dhaka-date";
import { jsonWithEtag } from "@/lib/http/etag";

export async function GET(req: Request) {
  return withTracing(req, "/api/reports/today-mini", async () => {
    try {
      const { searchParams } = new URL(req.url);
      const shopId = searchParams.get("shopId");

      if (!shopId) {
        return NextResponse.json({ error: "shopId missing" }, { status: 400 });
      }

      const user = await requireUser();
      await assertShopAccess(shopId, user);

      const { start: todayStart, end: todayEnd } = getDhakaDateOnlyRange();

      const salesRows = await prisma.sale.findMany({
        where: {
          shopId,
          status: { not: "VOIDED" },
          businessDate: { gte: todayStart, lte: todayEnd },
        },
      });

      const expenseRows = await prisma.expense.findMany({
        where: { shopId, expenseDate: { gte: todayStart, lte: todayEnd } },
      });

      const cashRows = await prisma.cashEntry.findMany({
        where: { shopId, businessDate: { gte: todayStart, lte: todayEnd } },
      });

      const salesTotal = salesRows.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);
      const expenseTotal = expenseRows.reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const cashIn = cashRows
        .filter((c) => c.entryType === "IN")
        .reduce((sum, c) => sum + Number(c.amount || 0), 0);
      const cashOut = cashRows
        .filter((c) => c.entryType === "OUT")
        .reduce((sum, c) => sum + Number(c.amount || 0), 0);

      return jsonWithEtag(req, {
        sales: {
          count: salesRows.length,
          totalAmount: Number(salesTotal.toFixed(2)),
        },
        expenses: {
          count: expenseRows.length,
          totalAmount: Number(expenseTotal.toFixed(2)),
        },
        cash: {
          in: Number(cashIn.toFixed(2)),
          out: Number(cashOut.toFixed(2)),
          balance: Number((cashIn - cashOut).toFixed(2)),
          count: cashRows.length,
        },
      }, {
        cacheControl: "private, no-store",
      });
    } catch (error) {
      console.error("today-mini error", error);
      return NextResponse.json(
        { error: "Failed to load today mini summary" },
        { status: 500 }
      );
    }
  });
}
