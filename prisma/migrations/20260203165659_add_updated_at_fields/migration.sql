-- Backfill-safe add: set DEFAULT now() so existing rows can be populated.
ALTER TABLE "cash_entries"
ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW();

ALTER TABLE "expenses"
ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW();

ALTER TABLE "products"
ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW();
