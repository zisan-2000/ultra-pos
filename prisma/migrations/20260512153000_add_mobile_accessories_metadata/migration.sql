ALTER TABLE "business_product_templates"
  ADD COLUMN IF NOT EXISTS "model_name" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "compatibility" VARCHAR(160),
  ADD COLUMN IF NOT EXISTS "warranty_days" INTEGER;

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "brand" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "model_name" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "compatibility" VARCHAR(160),
  ADD COLUMN IF NOT EXISTS "warranty_days" INTEGER;

CREATE INDEX IF NOT EXISTS "idx_products_shop_brand"
  ON "products"("shop_id", "brand");

CREATE INDEX IF NOT EXISTS "idx_products_shop_model_name"
  ON "products"("shop_id", "model_name");
