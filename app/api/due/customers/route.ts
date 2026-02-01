import { NextResponse } from "next/server";
import { createCustomer, getCustomersByShop } from "@/app/actions/customers";
import { jsonWithEtag } from "@/lib/http/etag";
import { apiErrorResponse } from "@/lib/http/api-errors";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const shopId = searchParams.get("shopId");

    if (!shopId) {
      return NextResponse.json({ error: "shopId is required" }, { status: 400 });
    }

    const rows = await getCustomersByShop(shopId);
    return jsonWithEtag(req, { data: rows }, {
      cacheControl: "private, no-cache",
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { shopId, name, phone, address } = body || {};

    if (!shopId || !name) {
      return NextResponse.json(
        { error: "shopId and name are required" },
        { status: 400 }
      );
    }

    const result = await createCustomer({
      shopId,
      name,
      phone,
      address,
    });

    return NextResponse.json({ success: true, id: result.id });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
