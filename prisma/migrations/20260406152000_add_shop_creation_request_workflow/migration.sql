ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "shop_limit" INTEGER NOT NULL DEFAULT 1;

-- Ensure existing owners keep current active shop count capacity.
WITH owner_shop_counts AS (
  SELECT
    s."owner_id" AS owner_id,
    COUNT(*)::int AS active_shop_count
  FROM "shops" s
  WHERE s."deleted_at" IS NULL
  GROUP BY s."owner_id"
)
UPDATE "users" u
SET "shop_limit" = osc.active_shop_count
FROM owner_shop_counts osc
WHERE u."id" = osc.owner_id
  AND u."shop_limit" < osc.active_shop_count;

CREATE TABLE IF NOT EXISTS "shop_creation_requests" (
  "id" UUID NOT NULL,
  "owner_id" TEXT NOT NULL,
  "requested_by_user_id" TEXT NOT NULL,
  "current_shop_count" INTEGER NOT NULL DEFAULT 0,
  "primary_shop_id_snapshot" UUID,
  "primary_shop_name_snapshot" TEXT,
  "primary_shop_phone_snapshot" TEXT,
  "reason" TEXT,
  "status" "FeatureAccessRequestStatus" NOT NULL DEFAULT 'pending',
  "decision_note" TEXT,
  "decided_by_user_id" TEXT,
  "approved_limit_after" INTEGER,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_at" TIMESTAMPTZ(6),
  CONSTRAINT "shop_creation_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shop_creation_requests_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "shop_creation_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "shop_creation_requests_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_shop_creation_requests_owner_status"
  ON "shop_creation_requests"("owner_id", "status");

CREATE INDEX IF NOT EXISTS "idx_shop_creation_requests_status_created"
  ON "shop_creation_requests"("status", "created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_shop_creation_requests_pending_owner"
  ON "shop_creation_requests"("owner_id")
  WHERE "status" = 'pending';

INSERT INTO "Permission" ("id", "name", "description")
VALUES
  ('perm_view_shop_creation_requests', 'view_shop_creation_requests', 'view shop creation requests'),
  ('perm_manage_shop_creation_requests', 'manage_shop_creation_requests', 'manage shop creation requests')
ON CONFLICT ("name") DO UPDATE
SET "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."name" IN (
  'view_shop_creation_requests',
  'manage_shop_creation_requests'
)
WHERE r."name" IN ('super_admin')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
