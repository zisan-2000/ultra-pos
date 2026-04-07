ALTER TABLE "shops"
ADD COLUMN IF NOT EXISTS "inventory_feature_entitled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "inventory_enabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "shops"
SET
  "inventory_feature_entitled" = true,
  "inventory_enabled" = true
WHERE "business_type" IN (
  'mini_grocery',
  'pharmacy',
  'clothing',
  'cosmetics_gift',
  'mini_wholesale'
);
