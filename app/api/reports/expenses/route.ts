import { jsonWithEtag } from "@/lib/http/etag";
import { getExpensesWithFilterPaginated } from "@/app/actions/reports";
import {
  clampReportLimit,
  isReportRangeValidationError,
  validateBoundedReportRange,
} from "@/lib/reporting-config";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const shopId = searchParams.get("shopId")!;
  const fromRaw = searchParams.get("from") || undefined;
  const toRaw = searchParams.get("to") || undefined;
  let from = fromRaw;
  let to = toRaw;
  try {
    const validated = validateBoundedReportRange(fromRaw, toRaw);
    from = validated.from;
    to = validated.to;
  } catch (error) {
    if (isReportRangeValidationError(error)) {
      return Response.json(
        { error: error.message, code: "INVALID_REPORT_RANGE" },
        { status: error.status }
      );
    }
    throw error;
  }
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

  return jsonWithEtag(req, { rows, nextCursor, hasMore }, {
    cacheControl: "private, no-cache",
  });
}
