import { NextResponse } from "next/server";
import { getExpensesWithFilterPaginated } from "@/app/actions/reports";
import { clampReportLimit } from "@/lib/reporting-config";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const shopId = searchParams.get("shopId")!;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const limit = clampReportLimit(searchParams.get("limit"));

  const cursorAt = searchParams.get("cursorAt");
  const cursorId = searchParams.get("cursorId");
  const cursorDate =
    cursorAt && cursorId ? new Date(cursorAt) : null;
  const cursor =
    cursorDate && !Number.isNaN(cursorDate.getTime()) && cursorId
      ? { at: cursorDate, id: cursorId }
      : null;

  const { rows, nextCursor, hasMore } = await getExpensesWithFilterPaginated({
    shopId,
    from,
    to,
    limit,
    cursor,
  });

  return NextResponse.json({ rows, nextCursor, hasMore });
}
