import { NextRequest, NextResponse } from "next/server";
import { clampReportLimit } from "@/lib/reporting-config";
import { getStockValuationReport } from "@/app/actions/reports";
import { jsonWithEtag } from "@/lib/http/etag";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");
    const limit = clampReportLimit(searchParams.get("limit"));

    if (!shopId) {
      return NextResponse.json({ error: "shopId required" }, { status: 400 });
    }

    const data = await getStockValuationReport(shopId, limit);
    return jsonWithEtag(request, { data }, {
      cacheControl: "private, no-cache",
    });
  } catch (error: any) {
    console.error("Stock valuation report error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
