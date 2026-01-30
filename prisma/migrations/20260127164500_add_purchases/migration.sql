-- Create purchases and purchase_items for inventory ledger
CREATE TABLE IF NOT EXISTS "purchases" (
  "id" uuid PRIMARY KEY,
  "shop_id" uuid NOT NULL,
  "supplier_name" text,
  "purchase_date" date NOT NULL,
  "payment_method" text NOT NULL DEFAULT 'cash',
  "total_amount" DECIMAL(12,2) NOT NULL,
  "paid_amount" DECIMAL(12,2) NOT NULL,
  "due_amount" DECIMAL(12,2) NOT NULL,
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "purchase_items" (
  "id" uuid PRIMARY KEY,
  "purchase_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "quantity" DECIMAL(12,2) NOT NULL,
  "unit_cost" DECIMAL(12,2) NOT NULL,
  "line_total" DECIMAL(12,2) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_purchases_shop_date" ON "purchases" ("shop_id", "purchase_date");
CREATE INDEX IF NOT EXISTS "idx_purchase_items_purchase" ON "purchase_items" ("purchase_id");
CREATE INDEX IF NOT EXISTS "idx_purchase_items_product" ON "purchase_items" ("product_id");

ALTER TABLE "purchases" ADD CONSTRAINT "purchases_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
