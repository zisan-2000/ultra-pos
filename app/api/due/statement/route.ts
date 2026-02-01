import { NextResponse } from "next/server";
import { getCustomerStatement } from "@/app/actions/customers";
import { jsonWithEtag } from "@/lib/http/etag";
import { apiErrorResponse } from "@/lib/http/api-errors";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const shopId = searchParams.get("shopId");
    const customerId = searchParams.get("customerId");

    if (!shopId || !customerId) {
      return NextResponse.json(
        { error: "shopId and customerId are required" },
        { status: 400 }
      );
    }

    const data = await getCustomerStatement(shopId, customerId);
    return jsonWithEtag(req, { data }, {
      cacheControl: "private, no-cache",
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
