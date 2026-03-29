ALTER TABLE "shops"
ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "idx_shops_owner_not_deleted"
ON "shops"("owner_id", "deleted_at");
