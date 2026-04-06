DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'FeatureAccessRequestStatus'
  ) THEN
    CREATE TYPE "FeatureAccessRequestStatus" AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "feature_access_requests" (
  "id" UUID NOT NULL,
  "shop_id" UUID NOT NULL,
  "owner_id" TEXT NOT NULL,
  "requested_by_user_id" TEXT NOT NULL,
  "feature_key" TEXT NOT NULL,
  "reason" TEXT,
  "status" "FeatureAccessRequestStatus" NOT NULL DEFAULT 'pending',
  "decision_note" TEXT,
  "decided_by_user_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_at" TIMESTAMPTZ(6),
  CONSTRAINT "feature_access_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "feature_access_requests_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "feature_access_requests_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "feature_access_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "feature_access_requests_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_feature_access_requests_shop_status"
  ON "feature_access_requests"("shop_id", "status");

CREATE INDEX IF NOT EXISTS "idx_feature_access_requests_owner_status"
  ON "feature_access_requests"("owner_id", "status");

CREATE INDEX IF NOT EXISTS "idx_feature_access_requests_feature_status"
  ON "feature_access_requests"("feature_key", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_feature_access_requests_pending_per_feature"
  ON "feature_access_requests"("shop_id", "feature_key")
  WHERE "status" = 'pending';

INSERT INTO "Permission" ("id", "name", "description")
VALUES
  ('perm_view_feature_access_requests', 'view_feature_access_requests', 'view feature access requests'),
  ('perm_manage_feature_access_requests', 'manage_feature_access_requests', 'manage feature access requests')
ON CONFLICT ("name") DO UPDATE
SET "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."name" IN (
  'view_feature_access_requests',
  'manage_feature_access_requests'
)
WHERE r."name" IN ('super_admin')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
