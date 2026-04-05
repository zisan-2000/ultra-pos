CREATE TABLE IF NOT EXISTS "product_variants" (
  "id" UUID NOT NULL,
  "shop_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "label" VARCHAR(80) NOT NULL,
  "sell_price" DECIMAL(12,2) NOT NULL,
  "sku" VARCHAR(80),
  "barcode" VARCHAR(80),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_variants_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_product_variants_shop_product"
  ON "product_variants"("shop_id", "product_id");

CREATE INDEX IF NOT EXISTS "idx_product_variants_product_active_order"
  ON "product_variants"("product_id", "is_active", "sort_order");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_product_variants_product_label"
  ON "product_variants"("product_id", "label");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_product_variants_shop_sku"
  ON "product_variants"("shop_id", "sku");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_product_variants_shop_barcode"
  ON "product_variants"("shop_id", "barcode");
