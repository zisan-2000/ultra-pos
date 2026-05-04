CREATE TABLE IF NOT EXISTS "stock_adjustments" (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id"          UUID NOT NULL,
  "product_id"       UUID NOT NULL,
  "variant_id"       UUID,
  "reason"           VARCHAR(80) NOT NULL,
  "note"             TEXT,
  "quantity_change"  DECIMAL(12,2) NOT NULL,
  "previous_qty"     DECIMAL(12,2) NOT NULL,
  "new_qty"          DECIMAL(12,2) NOT NULL,
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "stock_adjustments_shop_id_fkey"    FOREIGN KEY ("shop_id")    REFERENCES "shops"("id") ON DELETE RESTRICT,
  CONSTRAINT "stock_adjustments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT,
  CONSTRAINT "stock_adjustments_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_stock_adjustments_shop_created" ON "stock_adjustments"("shop_id","created_at");
CREATE INDEX IF NOT EXISTS "idx_stock_adjustments_product"      ON "stock_adjustments"("product_id");
