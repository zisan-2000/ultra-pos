ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "customer_id" uuid;
CREATE INDEX IF NOT EXISTS "idx_sales_customer" ON "sales" ("customer_id");
