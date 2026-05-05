ALTER TABLE "products"
ADD COLUMN "track_cut_length" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "default_cut_length" DECIMAL(12, 2);

CREATE TABLE "remnant_pieces" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "original_length" DECIMAL(12, 2) NOT NULL,
    "remaining_length" DECIMAL(12, 2) NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "source_ref" VARCHAR(120),
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "consumed_sale_item_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "remnant_pieces_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_remnant_pieces_shop_product_status"
ON "remnant_pieces"("shop_id", "product_id", "status");

CREATE INDEX "idx_remnant_pieces_shop_variant_status"
ON "remnant_pieces"("shop_id", "variant_id", "status");

CREATE INDEX "idx_remnant_pieces_consumed_sale_item"
ON "remnant_pieces"("consumed_sale_item_id");

ALTER TABLE "remnant_pieces"
ADD CONSTRAINT "remnant_pieces_shop_id_fkey"
FOREIGN KEY ("shop_id") REFERENCES "shops"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "remnant_pieces"
ADD CONSTRAINT "remnant_pieces_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "remnant_pieces"
ADD CONSTRAINT "remnant_pieces_variant_id_fkey"
FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "remnant_pieces"
ADD CONSTRAINT "remnant_pieces_consumed_sale_item_id_fkey"
FOREIGN KEY ("consumed_sale_item_id") REFERENCES "sale_items"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
