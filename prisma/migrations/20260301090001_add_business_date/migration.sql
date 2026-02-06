-- Add business_date columns for Dhaka-based reporting
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "business_date" date;
ALTER TABLE "cash_entries" ADD COLUMN IF NOT EXISTS "business_date" date;
ALTER TABLE "supplier_ledger" ADD COLUMN IF NOT EXISTS "business_date" date;
ALTER TABLE "customer_ledger" ADD COLUMN IF NOT EXISTS "business_date" date;
ALTER TABLE "purchase_payments" ADD COLUMN IF NOT EXISTS "business_date" date;

-- Indexes for business_date
CREATE INDEX IF NOT EXISTS "idx_sales_shop_business_date" ON "sales" ("shop_id", "business_date");
CREATE INDEX IF NOT EXISTS "idx_cash_entries_shop_business_date" ON "cash_entries" ("shop_id", "business_date");
CREATE INDEX IF NOT EXISTS "idx_supplier_ledger_shop_business_date" ON "supplier_ledger" ("shop_id", "business_date");
CREATE INDEX IF NOT EXISTS "idx_customer_ledger_shop_business_date" ON "customer_ledger" ("shop_id", "business_date");
CREATE INDEX IF NOT EXISTS "idx_purchase_payments_shop_business_date" ON "purchase_payments" ("shop_id", "business_date");

-- Backfill Dhaka business_date values
UPDATE "sales" SET "business_date" = ("sale_date" AT TIME ZONE 'Asia/Dhaka')::date WHERE "business_date" IS NULL;
UPDATE "cash_entries" SET "business_date" = ("created_at" AT TIME ZONE 'Asia/Dhaka')::date WHERE "business_date" IS NULL;
UPDATE "supplier_ledger" SET "business_date" = ("entry_date" AT TIME ZONE 'Asia/Dhaka')::date WHERE "business_date" IS NULL;
UPDATE "customer_ledger" SET "business_date" = ("entry_date" AT TIME ZONE 'Asia/Dhaka')::date WHERE "business_date" IS NULL;
UPDATE "purchase_payments" SET "business_date" = ("paid_at" AT TIME ZONE 'Asia/Dhaka')::date WHERE "business_date" IS NULL;
