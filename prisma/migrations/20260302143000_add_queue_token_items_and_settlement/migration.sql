-- Queue token monetary + settlement fields
ALTER TABLE "queue_tokens"
  ADD COLUMN IF NOT EXISTS "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "settled_sale_id" UUID,
  ADD COLUMN IF NOT EXISTS "settled_at" TIMESTAMPTZ(6);

-- Backfill
UPDATE "queue_tokens"
SET "total_amount" = 0
WHERE "total_amount" IS NULL;

-- Settlement relation uniqueness
DROP INDEX IF EXISTS "uq_queue_tokens_settled_sale_id";
CREATE UNIQUE INDEX "uq_queue_tokens_settled_sale_id"
  ON "queue_tokens" ("settled_sale_id");

ALTER TABLE "queue_tokens"
  ADD CONSTRAINT "queue_tokens_settled_sale_id_fkey"
  FOREIGN KEY ("settled_sale_id") REFERENCES "sales"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Queue token item snapshots
CREATE TABLE IF NOT EXISTS "queue_token_items" (
  "id" UUID NOT NULL,
  "token_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "product_name_snapshot" TEXT,
  "quantity" DECIMAL(12,2) NOT NULL,
  "unit_price" DECIMAL(12,2) NOT NULL,
  "line_total" DECIMAL(12,2) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "queue_token_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "queue_token_items_token_id_fkey"
    FOREIGN KEY ("token_id") REFERENCES "queue_tokens"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "queue_token_items_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_queue_token_items_token"
  ON "queue_token_items" ("token_id");

CREATE INDEX IF NOT EXISTS "idx_queue_token_items_product"
  ON "queue_token_items" ("product_id");
