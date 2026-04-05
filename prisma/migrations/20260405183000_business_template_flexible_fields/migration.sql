ALTER TABLE "business_product_templates"
ADD COLUMN IF NOT EXISTS "default_base_unit" VARCHAR(40),
ADD COLUMN IF NOT EXISTS "default_track_stock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "variants_json" JSONB;
