import { NextResponse } from "next/server";
import { getDueSummary } from "@/app/actions/customers";
import { jsonWithEtag } from "@/lib/http/etag";
import { apiErrorResponse } from "@/lib/http/api-errors";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const shopId = searchParams.get("shopId");

    if (!shopId) {
      return NextResponse.json({ error: "shopId is required" }, { status: 400 });
    }

    const summary = await getDueSummary(shopId);
    return jsonWithEtag(req, summary, {
      cacheControl: "private, no-store",
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
