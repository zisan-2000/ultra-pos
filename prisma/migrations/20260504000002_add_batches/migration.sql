-- Add trackBatch to products
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "track_batch" BOOLEAN NOT NULL DEFAULT false;

-- Create batches table
CREATE TABLE IF NOT EXISTS "batches" (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id"          UUID NOT NULL,
  "product_id"       UUID NOT NULL,
  "variant_id"       UUID,
  "batch_no"         VARCHAR(120) NOT NULL,
  "purchase_item_id" UUID,
  "total_qty"        DECIMAL(12,2) NOT NULL,
  "remaining_qty"    DECIMAL(12,2) NOT NULL,
  "is_active"        BOOLEAN NOT NULL DEFAULT true,
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "batches_shop_id_fkey"          FOREIGN KEY ("shop_id")          REFERENCES "shops"("id") ON DELETE RESTRICT,
  CONSTRAINT "batches_product_id_fkey"       FOREIGN KEY ("product_id")       REFERENCES "products"("id") ON DELETE RESTRICT,
  CONSTRAINT "batches_variant_id_fkey"       FOREIGN KEY ("variant_id")       REFERENCES "product_variants"("id") ON DELETE SET NULL,
  CONSTRAINT "batches_purchase_item_id_fkey" FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_batches_shop_product_batchno" ON "batches"("shop_id","product_id","batch_no");
CREATE INDEX IF NOT EXISTS "idx_batches_shop_product_remaining" ON "batches"("shop_id","product_id","remaining_qty");
CREATE INDEX IF NOT EXISTS "idx_batches_purchase_item" ON "batches"("purchase_item_id");
