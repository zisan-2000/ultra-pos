-- Add shop-level queue token feature flags
ALTER TABLE "shops"
  ADD COLUMN IF NOT EXISTS "queue_token_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "queue_token_prefix" TEXT,
  ADD COLUMN IF NOT EXISTS "next_queue_token_seq" INTEGER NOT NULL DEFAULT 1;

UPDATE "shops"
SET "next_queue_token_seq" = 1
WHERE "next_queue_token_seq" IS NULL;

-- Queue tokens table
CREATE TABLE IF NOT EXISTS "queue_tokens" (
  "id" UUID NOT NULL,
  "shop_id" UUID NOT NULL,
  "token_no" INTEGER NOT NULL,
  "token_label" TEXT NOT NULL,
  "order_type" TEXT NOT NULL DEFAULT 'dine_in',
  "customer_name" TEXT,
  "customer_phone" TEXT,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'WAITING',
  "called_at" TIMESTAMPTZ(6),
  "in_kitchen_at" TIMESTAMPTZ(6),
  "ready_at" TIMESTAMPTZ(6),
  "served_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "business_date" DATE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "queue_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "queue_tokens_shop_id_fkey"
    FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_queue_tokens_shop_token_no"
  ON "queue_tokens" ("shop_id", "token_no");

CREATE INDEX IF NOT EXISTS "idx_queue_tokens_shop_status_created"
  ON "queue_tokens" ("shop_id", "status", "created_at");

CREATE INDEX IF NOT EXISTS "idx_queue_tokens_shop_business_token"
  ON "queue_tokens" ("shop_id", "business_date", "token_no");
