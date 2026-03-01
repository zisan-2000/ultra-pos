ALTER TABLE "shops"
  ADD COLUMN IF NOT EXISTS "barcode_feature_entitled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "barcode_scan_enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "sku" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "barcode" VARCHAR(80);

UPDATE "products"
SET "sku" = NULL
WHERE "sku" IS NOT NULL AND btrim("sku") = '';

UPDATE "products"
SET "barcode" = NULL
WHERE "barcode" IS NOT NULL AND btrim("barcode") = '';

UPDATE "shops"
SET "barcode_scan_enabled" = false
WHERE COALESCE("barcode_feature_entitled", false) = false;

CREATE INDEX IF NOT EXISTS "idx_products_shop_sku"
  ON "products"("shop_id", "sku");

CREATE INDEX IF NOT EXISTS "idx_products_shop_barcode"
  ON "products"("shop_id", "barcode");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_products_shop_sku"
  ON "products"("shop_id", "sku");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_products_shop_barcode"
  ON "products"("shop_id", "barcode");
