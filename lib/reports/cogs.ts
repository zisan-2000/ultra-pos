import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeDhakaBusinessDate } from "@/lib/dhaka-date";

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
  const where: Prisma.Sql[] = [
    Prisma.sql`s.shop_id = CAST(${shopId} AS uuid)`,
    Prisma.sql`s.status <> 'VOIDED'`,
  ];

  if (from || to) {
    const startInput = from ? normalizeDhakaBusinessDate(from) : undefined;
    const endInput = to ? normalizeDhakaBusinessDate(to) : undefined;
    const fallbackEnd = endInput ?? normalizeDhakaBusinessDate();
    const { start, end } = ensureBoundedRange(startInput, fallbackEnd);
    where.push(Prisma.sql`s.business_date >= ${start}`);
    where.push(Prisma.sql`s.business_date <= ${end}`);
  }

  const rows = await prisma.$queryRaw<
    { sum: Prisma.Decimal | number | null }[]
  >(Prisma.sql`
    SELECT
      SUM(CAST(si.quantity AS numeric) * COALESCE(si.cost_at_sale, p.buy_price, 0)) AS sum
    FROM "sale_items" si
    JOIN "sales" s ON s.id = si.sale_id
    JOIN "products" p ON p.id = si.product_id
    WHERE ${Prisma.join(where, " AND ")}
  `);

  const raw = rows[0]?.sum ?? 0;
  return Number(raw);
}
