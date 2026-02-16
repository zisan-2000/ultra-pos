-- Legacy migration guard:
-- This migration was created before queue_tokens table creation was finalized.
-- During shadow DB replay the table may not exist yet, so we no-op safely.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'queue_tokens'
  ) THEN
    ALTER TABLE "queue_tokens" ALTER COLUMN "updated_at" DROP DEFAULT;
  END IF;
END $$;
