DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SmsDispatchStatus') THEN
    CREATE TYPE "SmsDispatchStatus" AS ENUM ('pending', 'sent', 'failed', 'skipped');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "sms_summary_dispatches" (
  "id" uuid NOT NULL,
  "shop_id" uuid NOT NULL,
  "business_date" date NOT NULL,
  "recipient_phone" text NOT NULL,
  "message_body" text NOT NULL,
  "status" "SmsDispatchStatus" NOT NULL DEFAULT 'pending',
  "provider" text,
  "provider_message_id" text,
  "error_message" text,
  "attempt_count" integer NOT NULL DEFAULT 0,
  "sent_at" timestamptz(6),
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sms_summary_dispatches_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'sms_summary_dispatches_shop_id_fkey'
      AND table_name = 'sms_summary_dispatches'
  ) THEN
    ALTER TABLE "sms_summary_dispatches"
    ADD CONSTRAINT "sms_summary_dispatches_shop_id_fkey"
    FOREIGN KEY ("shop_id") REFERENCES "shops"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_sms_summary_dispatches_shop_business_date"
ON "sms_summary_dispatches" ("shop_id", "business_date");

CREATE INDEX IF NOT EXISTS "idx_sms_summary_dispatches_business_status"
ON "sms_summary_dispatches" ("business_date", "status");

CREATE INDEX IF NOT EXISTS "idx_sms_summary_dispatches_shop_created"
ON "sms_summary_dispatches" ("shop_id", "created_at");
