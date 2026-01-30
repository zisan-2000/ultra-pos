-- Suppliers, supplier ledger, purchase payments
CREATE TABLE IF NOT EXISTS "suppliers" (
  "id" uuid PRIMARY KEY,
  "shop_id" uuid NOT NULL,
  "name" text NOT NULL,
  "phone" text,
  "address" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "supplier_ledger" (
  "id" uuid PRIMARY KEY,
  "shop_id" uuid NOT NULL,
  "supplier_id" uuid NOT NULL,
  "entry_type" text NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "note" text,
  "entry_date" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "purchase_payments" (
  "id" uuid PRIMARY KEY,
  "shop_id" uuid NOT NULL,
  "purchase_id" uuid NOT NULL,
  "supplier_id" uuid NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "payment_method" text NOT NULL DEFAULT 'cash',
  "paid_at" timestamptz NOT NULL,
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "supplier_id" uuid;

CREATE INDEX IF NOT EXISTS "idx_suppliers_shop" ON "suppliers" ("shop_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_suppliers_shop_name" ON "suppliers" ("shop_id", "name");
CREATE INDEX IF NOT EXISTS "idx_supplier_ledger_shop" ON "supplier_ledger" ("shop_id");
CREATE INDEX IF NOT EXISTS "idx_supplier_ledger_supplier" ON "supplier_ledger" ("supplier_id");
CREATE INDEX IF NOT EXISTS "idx_supplier_ledger_entry_date" ON "supplier_ledger" ("entry_date");
CREATE INDEX IF NOT EXISTS "idx_purchase_payments_shop_date" ON "purchase_payments" ("shop_id", "paid_at");
CREATE INDEX IF NOT EXISTS "idx_purchase_payments_purchase" ON "purchase_payments" ("purchase_id");
CREATE INDEX IF NOT EXISTS "idx_purchase_payments_supplier" ON "purchase_payments" ("supplier_id");
CREATE INDEX IF NOT EXISTS "idx_purchases_supplier" ON "purchases" ("supplier_id");

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_ledger" ADD CONSTRAINT "supplier_ledger_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_ledger" ADD CONSTRAINT "supplier_ledger_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
