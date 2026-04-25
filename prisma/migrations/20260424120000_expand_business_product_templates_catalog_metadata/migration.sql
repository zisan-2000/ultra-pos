ALTER TABLE "business_product_templates"
ADD COLUMN IF NOT EXISTS "brand" VARCHAR(120),
ADD COLUMN IF NOT EXISTS "pack_size" VARCHAR(80),
ADD COLUMN IF NOT EXISTS "default_barcode" VARCHAR(80),
ADD COLUMN IF NOT EXISTS "aliases_json" JSONB,
ADD COLUMN IF NOT EXISTS "keywords_json" JSONB,
ADD COLUMN IF NOT EXISTS "image_url" TEXT,
ADD COLUMN IF NOT EXISTS "popularity_score" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "idx_business_product_templates_popularity"
  ON "business_product_templates"("business_type", "popularity_score");

CREATE INDEX IF NOT EXISTS "idx_business_product_templates_default_barcode"
  ON "business_product_templates"("default_barcode");
