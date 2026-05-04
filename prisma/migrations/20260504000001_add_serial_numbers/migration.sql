-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SerialStatus" AS ENUM ('IN_STOCK', 'SOLD', 'RETURNED', 'DAMAGED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable: add track_serial_numbers to products
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "track_serial_numbers" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: serial_numbers
CREATE TABLE IF NOT EXISTS "serial_numbers" (
    "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id"          UUID NOT NULL,
    "product_id"       UUID NOT NULL,
    "variant_id"       UUID,
    "serial_no"        VARCHAR(120) NOT NULL,
    "status"           "SerialStatus" NOT NULL DEFAULT 'IN_STOCK',
    "purchase_item_id" UUID,
    "sale_item_id"     UUID,
    "note"             TEXT,
    "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "serial_numbers_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "serial_numbers"
    ADD CONSTRAINT "serial_numbers_shop_id_fkey"
    FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "serial_numbers"
    ADD CONSTRAINT "serial_numbers_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "serial_numbers"
    ADD CONSTRAINT "serial_numbers_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "serial_numbers"
    ADD CONSTRAINT "serial_numbers_purchase_item_id_fkey"
    FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "serial_numbers"
    ADD CONSTRAINT "serial_numbers_sale_item_id_fkey"
    FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Unique index: one serial per product per shop
CREATE UNIQUE INDEX IF NOT EXISTS "uq_serial_numbers_shop_product_serial"
  ON "serial_numbers"("shop_id", "product_id", "serial_no");

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS "idx_serial_numbers_shop_product_status"
  ON "serial_numbers"("shop_id", "product_id", "status");

CREATE INDEX IF NOT EXISTS "idx_serial_numbers_sale_item"
  ON "serial_numbers"("sale_item_id");

CREATE INDEX IF NOT EXISTS "idx_serial_numbers_purchase_item"
  ON "serial_numbers"("purchase_item_id");
