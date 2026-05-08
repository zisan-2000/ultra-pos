ALTER TABLE "products"
  ADD COLUMN "storage_location" VARCHAR(120);

ALTER TABLE "product_variants"
  ADD COLUMN "reorder_point" INTEGER,
  ADD COLUMN "storage_location" VARCHAR(120);

CREATE TABLE "product_unit_conversions" (
  "id" UUID NOT NULL,
  "shop_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "label" VARCHAR(80) NOT NULL,
  "base_unit_quantity" DECIMAL(12,2) NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_unit_conversions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_product_unit_conversions_shop_product"
  ON "product_unit_conversions"("shop_id", "product_id");

CREATE UNIQUE INDEX "uq_product_unit_conversions_product_label"
  ON "product_unit_conversions"("product_id", "label");

ALTER TABLE "product_unit_conversions"
  ADD CONSTRAINT "product_unit_conversions_shop_id_fkey"
  FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_unit_conversions"
  ADD CONSTRAINT "product_unit_conversions_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;