CREATE TABLE "batch_allocations" (
  "id" TEXT NOT NULL,
  "shop_id" TEXT NOT NULL,
  "batch_id" TEXT NOT NULL,
  "sale_item_id" TEXT NOT NULL,
  "quantity_allocated" DECIMAL(12, 2) NOT NULL,
  "quantity_returned" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "batch_allocations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_batch_allocations_shop_batch"
  ON "batch_allocations"("shop_id", "batch_id");

CREATE INDEX "idx_batch_allocations_sale_item"
  ON "batch_allocations"("sale_item_id");

CREATE INDEX "idx_batch_allocations_batch_created"
  ON "batch_allocations"("batch_id", "created_at");

ALTER TABLE "batch_allocations"
  ADD CONSTRAINT "batch_allocations_shop_id_fkey"
  FOREIGN KEY ("shop_id") REFERENCES "shops"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "batch_allocations"
  ADD CONSTRAINT "batch_allocations_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "batches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "batch_allocations"
  ADD CONSTRAINT "batch_allocations_sale_item_id_fkey"
  FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
