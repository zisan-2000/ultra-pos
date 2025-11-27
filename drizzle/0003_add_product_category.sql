ALTER TABLE "products"
ADD COLUMN IF NOT EXISTS "category" text NOT NULL DEFAULT 'Uncategorized';
