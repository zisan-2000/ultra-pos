ALTER TABLE "purchases"
ADD COLUMN "subtotal_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "transport_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "unloading_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "carrying_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "other_landed_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "landed_cost_total" DECIMAL(12,2) NOT NULL DEFAULT 0;

UPDATE "purchases"
SET
  "subtotal_amount" = COALESCE("total_amount", 0),
  "transport_cost" = 0,
  "unloading_cost" = 0,
  "carrying_cost" = 0,
  "other_landed_cost" = 0,
  "landed_cost_total" = 0
WHERE "subtotal_amount" = 0
  AND "transport_cost" = 0
  AND "unloading_cost" = 0
  AND "carrying_cost" = 0
  AND "other_landed_cost" = 0
  AND "landed_cost_total" = 0;

ALTER TABLE "purchase_items"
ADD COLUMN "landed_cost_allocated" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "effective_unit_cost" DECIMAL(12,4) NOT NULL DEFAULT 0,
ADD COLUMN "effective_line_total" DECIMAL(12,2) NOT NULL DEFAULT 0;

UPDATE "purchase_items"
SET
  "landed_cost_allocated" = 0,
  "effective_unit_cost" = COALESCE("unit_cost", 0),
  "effective_line_total" = COALESCE("line_total", 0)
WHERE "effective_unit_cost" = 0
  AND "effective_line_total" = 0;
