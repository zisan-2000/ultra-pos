import { NextResponse } from "next/server";
import { getAgingReport } from "@/app/actions/customers";
import { apiErrorResponse } from "@/lib/http/api-errors";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const shopId = searchParams.get("shopId");

    if (!shopId) {
      return NextResponse.json({ error: "shopId is required" }, { status: 400 });
    }

    const report = await getAgingReport(shopId);
    return NextResponse.json(report, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
