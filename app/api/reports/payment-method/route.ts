// app/api/reports/payment-method/route.ts

import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";

function parseTimestampRange(from?: string, to?: string) {
  const isDateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const parse = (value?: string, mode?: "start" | "end") => {
    if (!value) return undefined;
    if (isDateOnly(value)) {
      const tzOffset = "+06:00";
      const iso =
        mode === "end"
          ? `${value}T23:59:59.999${tzOffset}`
          : `${value}T00:00:00.000${tzOffset}`;
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? undefined : d;
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return undefined;
    return d;
  };
  return { start: parse(from, "start"), end: parse(to, "end") };
}

async function computePaymentMethodReport(
  shopId: string,
  from?: string,
  to?: string
) {
  const { start, end } = parseTimestampRange(from, to);
  const useUnbounded = !from && !to;

  const sales = await prisma.sale.groupBy({
    by: ["paymentMethod"],
    where: {
      shopId,
      status: { not: "VOIDED" },
      saleDate: useUnbounded
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
    name: s.paymentMethod || "???",
    value: Number(s._sum.totalAmount || 0),
    count: s._count.id,
  }));
}

const getPaymentMethodCached = unstable_cache(
  async (shopId: string, from?: string, to?: string) =>
    computePaymentMethodReport(shopId, from, to),
  ["reports-payment-method"],
  { revalidate: 60 }
);

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;

    if (!shopId) {
      return NextResponse.json({ error: "shopId required" }, { status: 400 });
    }

    await assertShopAccess(shopId, user);

    const data = await getPaymentMethodCached(shopId, from, to);

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("Payment method report error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
