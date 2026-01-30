-- Add cost_at_sale snapshot for accounting-safe COGS
ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "cost_at_sale" DECIMAL(12,2);

-- Backfill existing rows using current product buy_price (best-effort)
UPDATE "sale_items" si
SET "cost_at_sale" = p."buy_price"
FROM "products" p
WHERE si."product_id" = p."id"
  AND si."cost_at_sale" IS NULL;
