CREATE TABLE "purchase_returns" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "supplier_id" UUID,
    "return_date" DATE NOT NULL,
    "total_amount" DECIMAL(12, 2) NOT NULL,
    "supplier_credit" DECIMAL(12, 2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_returns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_return_items" (
    "id" UUID NOT NULL,
    "purchase_return_id" UUID NOT NULL,
    "purchase_item_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "quantity" DECIMAL(12, 2) NOT NULL,
    "unit_cost" DECIMAL(12, 2) NOT NULL,
    "line_total" DECIMAL(12, 2) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_return_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_purchase_returns_shop_date" ON "purchase_returns"("shop_id", "return_date");
CREATE INDEX "idx_purchase_returns_purchase" ON "purchase_returns"("purchase_id");
CREATE INDEX "idx_purchase_returns_supplier" ON "purchase_returns"("supplier_id");
CREATE INDEX "idx_purchase_return_items_return" ON "purchase_return_items"("purchase_return_id");
CREATE INDEX "idx_purchase_return_items_purchase_item" ON "purchase_return_items"("purchase_item_id");
CREATE INDEX "idx_purchase_return_items_product" ON "purchase_return_items"("product_id");

ALTER TABLE "purchase_returns"
ADD CONSTRAINT "purchase_returns_shop_id_fkey"
FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_returns"
ADD CONSTRAINT "purchase_returns_purchase_id_fkey"
FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_returns"
ADD CONSTRAINT "purchase_returns_supplier_id_fkey"
FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "purchase_returns"
ADD CONSTRAINT "purchase_returns_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "purchase_return_items"
ADD CONSTRAINT "purchase_return_items_purchase_return_id_fkey"
FOREIGN KEY ("purchase_return_id") REFERENCES "purchase_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_return_items"
ADD CONSTRAINT "purchase_return_items_purchase_item_id_fkey"
FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_return_items"
ADD CONSTRAINT "purchase_return_items_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_return_items"
ADD CONSTRAINT "purchase_return_items_variant_id_fkey"
FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
