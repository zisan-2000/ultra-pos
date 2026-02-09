-- Add shop-level invoice feature toggles
ALTER TABLE "shops"
  ADD COLUMN IF NOT EXISTS "sales_invoice_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "sales_invoice_prefix" TEXT,
  ADD COLUMN IF NOT EXISTS "next_sales_invoice_seq" INTEGER NOT NULL DEFAULT 1;

UPDATE "shops"
SET "next_sales_invoice_seq" = 1
WHERE "next_sales_invoice_seq" IS NULL;

-- Add invoice metadata on sales
ALTER TABLE "sales"
  ADD COLUMN IF NOT EXISTS "invoice_no" TEXT,
  ADD COLUMN IF NOT EXISTS "invoice_issued_at" TIMESTAMPTZ(6);

-- Snapshot item name for historical invoice stability
ALTER TABLE "sale_items"
  ADD COLUMN IF NOT EXISTS "product_name_snapshot" TEXT;

UPDATE "sale_items" si
SET "product_name_snapshot" = p."name"
FROM "products" p
WHERE si."product_id" = p."id"
  AND si."product_name_snapshot" IS NULL;

CREATE INDEX IF NOT EXISTS "idx_sales_shop_invoice"
  ON "sales" ("shop_id", "invoice_no");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_sales_shop_invoice_no"
  ON "sales" ("shop_id", "invoice_no");
