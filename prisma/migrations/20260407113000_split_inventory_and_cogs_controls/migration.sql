ALTER TABLE "shops"
ADD COLUMN IF NOT EXISTS "cogs_feature_entitled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "cogs_enabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "shops"
SET
  "cogs_feature_entitled" = COALESCE("inventory_feature_entitled", false),
  "cogs_enabled" = COALESCE("inventory_enabled", false)
WHERE "cogs_feature_entitled" = false
  AND "cogs_enabled" = false;
