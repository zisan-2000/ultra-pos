-- Make sale_items.line_total a generated column based on quantity * unit_price.
-- Note: Postgres cannot directly alter an existing column to GENERATED.
-- This migration drops and re-adds the column; data is derived, so loss is acceptable.

ALTER TABLE "sale_items" DROP COLUMN IF EXISTS "line_total";

ALTER TABLE "sale_items"
ADD COLUMN "line_total" numeric(12,2) GENERATED ALWAYS AS ("quantity" * "unit_price") STORED;
