ALTER TABLE "shops"
  ADD COLUMN IF NOT EXISTS "sales_invoice_print_size" TEXT NOT NULL DEFAULT 'thermal-80';

UPDATE "shops"
SET "sales_invoice_print_size" = 'thermal-80'
WHERE "sales_invoice_print_size" IS NULL OR "sales_invoice_print_size" = '';
