import { NextResponse } from "next/server";
import {
  getReportSummaryBundle,
} from "@/app/actions/reports";
import { reportError } from "@/lib/monitoring";
import { withTracing } from "@/lib/tracing";
import { jsonWithEtag } from "@/lib/http/etag";
import {
  isReportRangeValidationError,
  validateBoundedReportRange,
} from "@/lib/reporting-config";

export async function GET(req: Request) {
  return withTracing(req, "/api/reports/summary", async () => {
    try {
      const { searchParams } = new URL(req.url);
      const shopId = searchParams.get("shopId");
      const from = searchParams.get("from") || undefined;
      const to = searchParams.get("to") || undefined;
      const fresh = searchParams.get("fresh") === "1";

      if (!shopId) {
        return NextResponse.json({ error: "shopId missing" }, { status: 400 });
      }
      const validated = validateBoundedReportRange(from, to);

      const { sales, expense, cash, profit } = await getReportSummaryBundle(
        shopId,
        validated.from,
        validated.to,
        { fresh }
      );

      return jsonWithEtag(req, { sales, expense, cash, profit }, {
        cacheControl: "private, no-store",
      });
    } catch (err) {
      if (isReportRangeValidationError(err)) {
        return NextResponse.json(
          { error: err.message, code: "INVALID_REPORT_RANGE" },
          { status: err.status }
        );
      }
      console.error("summary report error", err);
      await reportError(err, { route: "/api/reports/summary" });
      return NextResponse.json(
        { error: "Failed to load summary" },
        { status: 500 }
      );
    }
  });
}
