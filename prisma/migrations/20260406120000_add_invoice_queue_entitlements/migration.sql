ALTER TABLE "shops"
ADD COLUMN IF NOT EXISTS "sales_invoice_entitled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "shops"
ADD COLUMN IF NOT EXISTS "queue_token_entitled" BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing shops so currently enabled features keep working after entitlement gate.
UPDATE "shops"
SET "sales_invoice_entitled" = true
WHERE "sales_invoice_enabled" = true;

UPDATE "shops"
SET "queue_token_entitled" = true
WHERE "queue_token_enabled" = true;

INSERT INTO "Permission" ("id", "name", "description")
VALUES
  ('perm_manage_shop_invoice_entitlement', 'manage_shop_invoice_entitlement', 'manage shop invoice entitlement'),
  ('perm_manage_shop_queue_entitlement', 'manage_shop_queue_entitlement', 'manage shop queue entitlement')
ON CONFLICT ("name") DO UPDATE
SET "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."name" IN (
  'manage_shop_invoice_entitlement',
  'manage_shop_queue_entitlement'
)
WHERE r."name" IN ('super_admin')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
