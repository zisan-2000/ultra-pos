ALTER TABLE "shops"
ADD COLUMN "deleted_at" TIMESTAMPTZ;

CREATE INDEX "idx_shops_owner_not_deleted"
ON "shops"("owner_id", "deleted_at");

