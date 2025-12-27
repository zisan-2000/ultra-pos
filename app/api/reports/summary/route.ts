import { NextResponse } from "next/server";
import {
  getCashSummary,
  getExpenseSummary,
  getProfitSummary,
  getSalesSummary,
} from "@/app/actions/reports";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const shopId = searchParams.get("shopId");
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;

    if (!shopId) {
      return NextResponse.json({ error: "shopId missing" }, { status: 400 });
    }

    const user = await requireUser();
    await assertShopAccess(shopId, user);

    const [sales, expense, cash, profit] = await Promise.all([
      getSalesSummary(shopId, from, to),
      getExpenseSummary(shopId, from, to),
      getCashSummary(shopId, from, to),
      getProfitSummary(shopId, from, to),
    ]);

    return NextResponse.json({ sales, expense, cash, profit });
  } catch (err) {
    console.error("summary report error", err);
    return NextResponse.json({ error: "Failed to load summary" }, { status: 500 });
  }
}
