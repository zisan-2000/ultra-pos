-- Guard against replay order issues in shadow DB.
DO $$
BEGIN
  IF to_regclass('public.queue_token_items') IS NOT NULL THEN
    ALTER TABLE "queue_token_items"
      DROP CONSTRAINT IF EXISTS "queue_token_items_token_id_fkey";
  END IF;
END
$$;

-- AlterTable (only when queue_tokens table exists)
DO $$
BEGIN
  IF to_regclass('public.queue_tokens') IS NOT NULL THEN
    ALTER TABLE "queue_tokens" ALTER COLUMN "updated_at" DROP DEFAULT;
  END IF;
END
$$;

-- AlterTable (only when sale_returns table exists)
DO $$
BEGIN
  IF to_regclass('public.sale_returns') IS NOT NULL THEN
    ALTER TABLE "sale_returns" ALTER COLUMN "updated_at" DROP DEFAULT;
  END IF;
END
$$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_expenses_shop" ON "expenses"("shop_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_sale_items_sale_product" ON "sale_items"("sale_id", "product_id");

-- CreateIndex (only when business_date exists)
DO $$
BEGIN
  IF to_regclass('public.sales') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'sales'
         AND column_name = 'business_date'
     ) THEN
    CREATE INDEX IF NOT EXISTS "idx_sales_shop_status_business_date"
      ON "sales"("shop_id", "status", "business_date");
  END IF;
END
$$;

-- AddForeignKey (only when tables exist and constraint is missing)
DO $$
BEGIN
  IF to_regclass('public.queue_token_items') IS NOT NULL
     AND to_regclass('public.queue_tokens') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'queue_token_items_token_id_fkey'
     ) THEN
    ALTER TABLE "queue_token_items"
      ADD CONSTRAINT "queue_token_items_token_id_fkey"
      FOREIGN KEY ("token_id") REFERENCES "queue_tokens"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;
