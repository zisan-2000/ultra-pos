ALTER TABLE "purchase_items"
ADD COLUMN "purchase_qty" DECIMAL(12,2),
ADD COLUMN "purchase_unit_label" VARCHAR(80),
ADD COLUMN "base_unit_quantity" DECIMAL(12,4),
ADD COLUMN "unit_conversion_id" UUID;

CREATE INDEX "idx_purchase_items_unit_conversion"
ON "purchase_items"("unit_conversion_id");

ALTER TABLE "purchase_items"
ADD CONSTRAINT "purchase_items_unit_conversion_id_fkey"
FOREIGN KEY ("unit_conversion_id")
REFERENCES "product_unit_conversions"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
