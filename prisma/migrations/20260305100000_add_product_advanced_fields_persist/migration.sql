ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "base_unit" VARCHAR(40) NOT NULL DEFAULT 'pcs',
  ADD COLUMN IF NOT EXISTS "expiry_date" DATE,
  ADD COLUMN IF NOT EXISTS "size" VARCHAR(80);

UPDATE "products"
SET "base_unit" = 'pcs'
WHERE "base_unit" IS NULL OR btrim("base_unit") = '';

UPDATE "products"
SET "size" = NULL
WHERE "size" IS NOT NULL AND btrim("size") = '';
