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
  const salesWhere: Prisma.Sql[] = [
    Prisma.sql`s.shop_id = CAST(${shopId} AS uuid)`,
    Prisma.sql`s.status <> 'VOIDED'`,
  ];
  const returnWhere: Prisma.Sql[] = [
    Prisma.sql`sr.shop_id = CAST(${shopId} AS uuid)`,
    Prisma.sql`sr.status = 'completed'`,
  ];

  if (from || to) {
    const startInput = from ? normalizeDhakaBusinessDate(from) : undefined;
    const endInput = to ? normalizeDhakaBusinessDate(to) : undefined;
    const fallbackEnd = endInput ?? normalizeDhakaBusinessDate();
    const { start, end } = ensureBoundedRange(startInput, fallbackEnd);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);
    salesWhere.push(Prisma.sql`s.business_date >= CAST(${startDate} AS date)`);
    salesWhere.push(Prisma.sql`s.business_date <= CAST(${endDate} AS date)`);
    returnWhere.push(Prisma.sql`sr.business_date >= CAST(${startDate} AS date)`);
    returnWhere.push(Prisma.sql`sr.business_date <= CAST(${endDate} AS date)`);
  }

  const rows = await prisma.$queryRaw<
    {
      sales_cogs: Prisma.Decimal | number | null;
      returned_cogs: Prisma.Decimal | number | null;
      exchange_cogs: Prisma.Decimal | number | null;
    }[]
  >(Prisma.sql`
    WITH sales_cogs AS (
      SELECT
        SUM(CAST(si.quantity AS numeric) * COALESCE(si.cost_at_sale, p.buy_price, 0)) AS sum
      FROM "sale_items" si
      JOIN "sales" s ON s.id = si.sale_id
      JOIN "products" p ON p.id = si.product_id
      WHERE ${Prisma.join(salesWhere, " AND ")}
    ),
    returned_cogs AS (
      SELECT
        SUM(CAST(sri.quantity AS numeric) * COALESCE(sri.cost_at_return, p.buy_price, 0)) AS sum
      FROM "sale_return_items" sri
      JOIN "sale_returns" sr ON sr.id = sri.sale_return_id
      JOIN "products" p ON p.id = sri.product_id
      WHERE ${Prisma.join(returnWhere, " AND ")}
    ),
    exchange_cogs AS (
      SELECT
        SUM(CAST(srei.quantity AS numeric) * COALESCE(srei.cost_at_return, p.buy_price, 0)) AS sum
      FROM "sale_return_exchange_items" srei
      JOIN "sale_returns" sr ON sr.id = srei.sale_return_id
      JOIN "products" p ON p.id = srei.product_id
      WHERE ${Prisma.join(returnWhere, " AND ")}
    )
    SELECT
      (SELECT sum FROM sales_cogs) AS sales_cogs,
      (SELECT sum FROM returned_cogs) AS returned_cogs,
      (SELECT sum FROM exchange_cogs) AS exchange_cogs
  `);

  const row = rows[0];
  const salesCogs = Number(row?.sales_cogs ?? 0);
  const returnedCogs = Number(row?.returned_cogs ?? 0);
  const exchangeCogs = Number(row?.exchange_cogs ?? 0);
  return salesCogs - returnedCogs + exchangeCogs;
}
