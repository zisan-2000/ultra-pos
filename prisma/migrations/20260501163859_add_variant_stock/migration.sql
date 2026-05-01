-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "stock_qty" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "variant_id" UUID;

-- CreateIndex
CREATE INDEX "idx_sale_items_variant" ON "sale_items"("variant_id");

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
