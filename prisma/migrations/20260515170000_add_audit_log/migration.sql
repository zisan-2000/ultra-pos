-- Add append-only audit log table for accountability and forensic history.
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" TEXT NOT NULL,
  "shop_id" UUID NOT NULL,
  "user_id" TEXT,
  "user_name" TEXT,
  "user_roles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "action" TEXT NOT NULL,
  "target_type" TEXT NOT NULL,
  "target_id" TEXT,
  "summary" TEXT NOT NULL,
  "metadata" JSONB,
  "severity" TEXT NOT NULL DEFAULT 'info',
  "ip_address" TEXT,
  "user_agent" TEXT,
  "correlation_id" TEXT,
  "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "business_date" TEXT NOT NULL,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_shop_id_fkey'
  ) THEN
    ALTER TABLE "audit_logs"
      ADD CONSTRAINT "audit_logs_shop_id_fkey"
      FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_user_id_fkey'
  ) THEN
    ALTER TABLE "audit_logs"
      ADD CONSTRAINT "audit_logs_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_audit_logs_shop_at" ON "audit_logs"("shop_id", "at" DESC);
CREATE INDEX IF NOT EXISTS "idx_audit_logs_shop_user_at" ON "audit_logs"("shop_id", "user_id", "at" DESC);
CREATE INDEX IF NOT EXISTS "idx_audit_logs_shop_action_at" ON "audit_logs"("shop_id", "action", "at" DESC);
CREATE INDEX IF NOT EXISTS "idx_audit_logs_shop_severity_at" ON "audit_logs"("shop_id", "severity", "at" DESC);
CREATE INDEX IF NOT EXISTS "idx_audit_logs_shop_business_date" ON "audit_logs"("shop_id", "business_date");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_target" ON "audit_logs"("target_type", "target_id");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_correlation" ON "audit_logs"("correlation_id");

INSERT INTO "Permission" ("id", "name", "description")
VALUES ('perm_view_audit_log', 'view_audit_log', 'view audit log')
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."name" = 'view_audit_log'
WHERE r."name" IN ('super_admin', 'owner')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
