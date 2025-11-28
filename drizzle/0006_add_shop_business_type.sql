ALTER TABLE "shops"
ADD COLUMN IF NOT EXISTS "business_type" text NOT NULL DEFAULT 'tea_stall';
