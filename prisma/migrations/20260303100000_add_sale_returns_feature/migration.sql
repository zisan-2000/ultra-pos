-- Sale return / refund / exchange core entities

ALTER TABLE "shops"
  ADD COLUMN IF NOT EXISTS "sale_return_prefix" TEXT,
  ADD COLUMN IF NOT EXISTS "next_sale_return_seq" INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SaleReturnType') THEN
    CREATE TYPE "SaleReturnType" AS ENUM ('refund', 'exchange');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SaleReturnStatus') THEN
    CREATE TYPE "SaleReturnStatus" AS ENUM ('completed', 'canceled');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "sale_returns" (
  "id" UUID NOT NULL,
  "shop_id" UUID NOT NULL,
  "sale_id" UUID NOT NULL,
  "return_no" TEXT NOT NULL,
  "type" "SaleReturnType" NOT NULL,
  "status" "SaleReturnStatus" NOT NULL DEFAULT 'completed',
  "reason" TEXT,
  "note" TEXT,
  "subtotal" DECIMAL(12,2) NOT NULL,
  "exchange_subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "net_amount" DECIMAL(12,2) NOT NULL,
  "refund_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "additional_cash_in_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "due_adjustment_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "additional_due_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "business_date" DATE,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sale_returns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sale_return_items" (
  "id" UUID NOT NULL,
  "sale_return_id" UUID NOT NULL,
  "sale_item_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "product_name_snapshot" TEXT,
  "quantity" DECIMAL(12,2) NOT NULL,
  "unit_price" DECIMAL(12,2) NOT NULL,
  "line_total" DECIMAL(12,2) NOT NULL,
  "cost_at_return" DECIMAL(12,2),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sale_return_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sale_return_exchange_items" (
  "id" UUID NOT NULL,
  "sale_return_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "product_name_snapshot" TEXT,
  "quantity" DECIMAL(12,2) NOT NULL,
  "unit_price" DECIMAL(12,2) NOT NULL,
  "line_total" DECIMAL(12,2) NOT NULL,
  "cost_at_return" DECIMAL(12,2),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sale_return_exchange_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_sale_returns_shop_return_no"
  ON "sale_returns"("shop_id", "return_no");
CREATE INDEX IF NOT EXISTS "idx_sale_returns_shop_business_date"
  ON "sale_returns"("shop_id", "business_date");
CREATE INDEX IF NOT EXISTS "idx_sale_returns_sale"
  ON "sale_returns"("sale_id");
CREATE INDEX IF NOT EXISTS "idx_sale_returns_shop_status_created"
  ON "sale_returns"("shop_id", "status", "created_at");

CREATE INDEX IF NOT EXISTS "idx_sale_return_items_sale_return"
  ON "sale_return_items"("sale_return_id");
CREATE INDEX IF NOT EXISTS "idx_sale_return_items_sale_item"
  ON "sale_return_items"("sale_item_id");
CREATE INDEX IF NOT EXISTS "idx_sale_return_items_product"
  ON "sale_return_items"("product_id");

CREATE INDEX IF NOT EXISTS "idx_sale_return_exchange_items_sale_return"
  ON "sale_return_exchange_items"("sale_return_id");
CREATE INDEX IF NOT EXISTS "idx_sale_return_exchange_items_product"
  ON "sale_return_exchange_items"("product_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sale_returns_shop_id_fkey'
  ) THEN
    ALTER TABLE "sale_returns"
      ADD CONSTRAINT "sale_returns_shop_id_fkey"
      FOREIGN KEY ("shop_id") REFERENCES "shops"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sale_returns_sale_id_fkey'
  ) THEN
    ALTER TABLE "sale_returns"
      ADD CONSTRAINT "sale_returns_sale_id_fkey"
      FOREIGN KEY ("sale_id") REFERENCES "sales"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sale_returns_created_by_user_id_fkey'
  ) THEN
    ALTER TABLE "sale_returns"
      ADD CONSTRAINT "sale_returns_created_by_user_id_fkey"
      FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sale_return_items_sale_return_id_fkey'
  ) THEN
    ALTER TABLE "sale_return_items"
      ADD CONSTRAINT "sale_return_items_sale_return_id_fkey"
      FOREIGN KEY ("sale_return_id") REFERENCES "sale_returns"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sale_return_items_sale_item_id_fkey'
  ) THEN
    ALTER TABLE "sale_return_items"
      ADD CONSTRAINT "sale_return_items_sale_item_id_fkey"
      FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sale_return_items_product_id_fkey'
  ) THEN
    ALTER TABLE "sale_return_items"
      ADD CONSTRAINT "sale_return_items_product_id_fkey"
      FOREIGN KEY ("product_id") REFERENCES "products"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sale_return_exchange_items_sale_return_id_fkey'
  ) THEN
    ALTER TABLE "sale_return_exchange_items"
      ADD CONSTRAINT "sale_return_exchange_items_sale_return_id_fkey"
      FOREIGN KEY ("sale_return_id") REFERENCES "sale_returns"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sale_return_exchange_items_product_id_fkey'
  ) THEN
    ALTER TABLE "sale_return_exchange_items"
      ADD CONSTRAINT "sale_return_exchange_items_product_id_fkey"
      FOREIGN KEY ("product_id") REFERENCES "products"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;
