ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "generic_name" VARCHAR(160),
  ADD COLUMN IF NOT EXISTS "strength" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "dosage_form" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "manufacturer" VARCHAR(160);

ALTER TABLE "purchase_items"
  ADD COLUMN IF NOT EXISTS "batch_no" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "batch_expiry_date" DATE;

ALTER TABLE "batches"
  ADD COLUMN IF NOT EXISTS "expiry_date" DATE;

CREATE INDEX IF NOT EXISTS "idx_products_shop_generic_name"
  ON "products"("shop_id", "generic_name");

CREATE INDEX IF NOT EXISTS "idx_products_shop_manufacturer"
  ON "products"("shop_id", "manufacturer");

CREATE INDEX IF NOT EXISTS "idx_batches_shop_expiry_remaining"
  ON "batches"("shop_id", "expiry_date", "remaining_qty");
