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

      const [salesAgg, saleReturnAgg, expenseAgg, cashRows] = await Promise.all([
        prisma.sale.aggregate({
          where: {
            shopId,
            status: { not: "VOIDED" },
            businessDate: { gte: todayStart, lte: todayEnd },
          },
          _sum: { totalAmount: true },
          _count: { _all: true },
        }),
        prisma.saleReturn.aggregate({
          where: {
            shopId,
            status: "completed",
            businessDate: { gte: todayStart, lte: todayEnd },
          },
          _sum: { netAmount: true },
        }),
        prisma.expense.aggregate({
          where: { shopId, expenseDate: { gte: todayStart, lte: todayEnd } },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        prisma.cashEntry.findMany({
          where: { shopId, businessDate: { gte: todayStart, lte: todayEnd } },
        }),
      ]);

      const salesTotal =
        Number(salesAgg._sum.totalAmount ?? 0) +
        Number(saleReturnAgg._sum.netAmount ?? 0);
      const expenseTotal = Number(expenseAgg._sum.amount ?? 0);
      const cashIn = cashRows
        .filter((c) => c.entryType === "IN")
        .reduce((sum, c) => sum + Number(c.amount || 0), 0);
      const cashOut = cashRows
        .filter((c) => c.entryType === "OUT")
        .reduce((sum, c) => sum + Number(c.amount || 0), 0);

      return jsonWithEtag(req, {
        sales: {
          count: salesAgg._count._all ?? 0,
          totalAmount: Number(salesTotal.toFixed(2)),
        },
        expenses: {
          count: expenseAgg._count._all ?? 0,
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
