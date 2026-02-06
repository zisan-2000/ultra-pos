// app/api/reports/payment-method/route.ts

import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";
import { REPORTS_CACHE_TAGS } from "@/lib/reports/cache-tags";
import { jsonWithEtag } from "@/lib/http/etag";
import { parseDhakaDateOnlyRange } from "@/lib/dhaka-date";

const parseDateRange = (from?: string, to?: string) =>
  parseDhakaDateOnlyRange(from, to, true);

async function computePaymentMethodReport(
  shopId: string,
  from?: string,
  to?: string
) {
  const { start, end } = parseDateRange(from, to);
  const useUnbounded = !from && !to;

  const sales = await prisma.sale.groupBy({
    by: ["paymentMethod"],
    where: {
      shopId,
      status: { not: "VOIDED" },
      businessDate: useUnbounded
        ? undefined
        : {
            gte: start,
            lte: end,
          },
    },
    _sum: {
      totalAmount: true,
    },
    _count: {
      id: true,
    },
  });

  return sales.map((s) => ({
    name: s.paymentMethod || "Unknown",
    value: Number(s._sum.totalAmount || 0),
    count: s._count.id,
  }));
}

const getPaymentMethodCached = unstable_cache(
  async (shopId: string, from?: string, to?: string) =>
    computePaymentMethodReport(shopId, from, to),
  ["reports-payment-method"],
  { revalidate: 60, tags: [REPORTS_CACHE_TAGS.paymentMethod] }
);

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;
    const fresh = searchParams.get("fresh") === "1";

    if (!shopId) {
      return NextResponse.json({ error: "shopId required" }, { status: 400 });
    }

    await assertShopAccess(shopId, user);

    const data = fresh
      ? await computePaymentMethodReport(shopId, from, to)
      : await getPaymentMethodCached(shopId, from, to);

    return jsonWithEtag(request, { data }, {
      cacheControl: "private, no-cache",
    });
  } catch (error: any) {
    console.error("Payment method report error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
