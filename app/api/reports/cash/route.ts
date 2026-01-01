import { NextResponse } from "next/server";
import { getCashWithFilter } from "@/app/actions/reports";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const shopId = searchParams.get("shopId")!;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const limitParam = Number(searchParams.get("limit") || "");
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.max(Math.floor(limitParam), 1), 500)
      : 200;

  const rows = await getCashWithFilter(shopId, from, to, limit);

  return NextResponse.json({ rows });
}
