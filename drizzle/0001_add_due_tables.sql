CREATE TABLE IF NOT EXISTS "customers" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "shop_id" uuid NOT NULL,
    "name" text NOT NULL,
    "phone" text,
    "address" text,
    "total_due" numeric(12, 2) NOT NULL DEFAULT '0',
    "last_payment_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_customers_shop" ON "customers" ("shop_id");
CREATE INDEX IF NOT EXISTS "idx_customers_phone" ON "customers" ("phone");

CREATE TABLE IF NOT EXISTS "customer_ledger" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "shop_id" uuid NOT NULL,
    "customer_id" uuid NOT NULL,
    "entry_type" text NOT NULL,
    "amount" numeric(12, 2) NOT NULL,
    "description" text,
    "entry_date" timestamp with time zone DEFAULT now(),
    "created_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_customer_ledger_shop" ON "customer_ledger" ("shop_id");
CREATE INDEX IF NOT EXISTS "idx_customer_ledger_customer" ON "customer_ledger" ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_customer_ledger_entry_date" ON "customer_ledger" ("entry_date");
