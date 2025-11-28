import { NextResponse } from "next/server";
import { getExpensesWithFilter } from "@/app/actions/reports";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const shopId = searchParams.get("shopId")!;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;

  const rows = await getExpensesWithFilter(shopId, from, to);

  return NextResponse.json({ rows });
}
