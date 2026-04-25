-- CreateEnum
CREATE TYPE "CatalogProductMergeMode" AS ENUM ('archive', 'delete');

-- AlterTable
ALTER TABLE "catalog_products"
ADD COLUMN "merged_at" TIMESTAMPTZ(6),
ADD COLUMN "merged_into_catalog_product_id" UUID;

-- CreateTable
CREATE TABLE "catalog_product_merge_actions" (
    "id" UUID NOT NULL,
    "source_catalog_product_id" UUID,
    "source_product_name_snapshot" TEXT NOT NULL,
    "source_business_type_snapshot" TEXT,
    "target_catalog_product_id" UUID,
    "target_product_name_snapshot" TEXT NOT NULL,
    "target_business_type_snapshot" TEXT,
    "merge_mode" "CatalogProductMergeMode" NOT NULL,
    "moved_template_count" INTEGER NOT NULL DEFAULT 0,
    "moved_shop_product_count" INTEGER NOT NULL DEFAULT 0,
    "moved_snapshot_count" INTEGER NOT NULL DEFAULT 0,
    "moved_alias_count" INTEGER NOT NULL DEFAULT 0,
    "moved_barcode_count" INTEGER NOT NULL DEFAULT 0,
    "merged_by_user_id" TEXT,
    "merged_by_label" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_product_merge_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_catalog_products_merged_into" ON "catalog_products"("merged_into_catalog_product_id");

-- CreateIndex
CREATE INDEX "idx_catalog_products_merged_at" ON "catalog_products"("merged_at");

-- CreateIndex
CREATE INDEX "idx_catalog_product_merge_actions_source" ON "catalog_product_merge_actions"("source_catalog_product_id");

-- CreateIndex
CREATE INDEX "idx_catalog_product_merge_actions_target" ON "catalog_product_merge_actions"("target_catalog_product_id");

-- CreateIndex
CREATE INDEX "idx_catalog_product_merge_actions_mode_created" ON "catalog_product_merge_actions"("merge_mode", "created_at");

-- AddForeignKey
ALTER TABLE "catalog_products"
ADD CONSTRAINT "catalog_products_merged_into_catalog_product_id_fkey"
FOREIGN KEY ("merged_into_catalog_product_id") REFERENCES "catalog_products"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_product_merge_actions"
ADD CONSTRAINT "catalog_product_merge_actions_source_catalog_product_id_fkey"
FOREIGN KEY ("source_catalog_product_id") REFERENCES "catalog_products"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_product_merge_actions"
ADD CONSTRAINT "catalog_product_merge_actions_target_catalog_product_id_fkey"
FOREIGN KEY ("target_catalog_product_id") REFERENCES "catalog_products"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
