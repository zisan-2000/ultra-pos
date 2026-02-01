import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function ensureBoundedRange(
  start?: Date | null,
  end?: Date | null,
  fallbackDays = 30
) {
  const endDate = end ? new Date(end) : new Date();
  const startDate = start
    ? new Date(start)
    : new Date(endDate.getTime() - fallbackDays * 24 * 60 * 60 * 1000);

  return { start: startDate, end: endDate };
}

export async function getCogsTotalRaw(
  shopId: string,
  from?: Date | null,
  to?: Date | null
) {
  const { start, end } = ensureBoundedRange(from, to);

  const rows = await prisma.$queryRaw<
    { sum: Prisma.Decimal | number | null }[]
  >(Prisma.sql`
    SELECT
      SUM(CAST(si.quantity AS numeric) * COALESCE(si.cost_at_sale, p.buy_price, 0)) AS sum
    FROM "sale_items" si
    JOIN "sales" s ON s.id = si.sale_id
    JOIN "products" p ON p.id = si.product_id
    WHERE s.shop_id = CAST(${shopId} AS uuid)
      AND s.status <> 'VOIDED'
      AND s.sale_date >= ${start}
      AND s.sale_date <= ${end}
  `);

  const raw = rows[0]?.sum ?? 0;
  return Number(raw);
}
