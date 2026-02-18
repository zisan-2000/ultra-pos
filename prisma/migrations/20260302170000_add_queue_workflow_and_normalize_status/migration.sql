ALTER TABLE "shops"
  ADD COLUMN IF NOT EXISTS "queue_workflow" TEXT;

UPDATE "queue_tokens"
SET "status" = 'IN_PROGRESS'
WHERE "status" = 'IN_KITCHEN';

UPDATE "queue_tokens"
SET "status" = 'DONE'
WHERE "status" = 'SERVED';
