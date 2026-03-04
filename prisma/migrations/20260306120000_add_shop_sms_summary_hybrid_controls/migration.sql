ALTER TABLE "shops"
ADD COLUMN IF NOT EXISTS "sms_summary_entitled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "sms_summary_enabled" BOOLEAN NOT NULL DEFAULT false;

INSERT INTO "Permission" ("id", "name", "description")
VALUES
  (
    'perm_manage_shop_sms_entitlement',
    'manage_shop_sms_entitlement',
    'manage shop sms entitlement'
  ),
  (
    'perm_manage_shop_sms_feature',
    'manage_shop_sms_feature',
    'manage shop sms feature'
  )
ON CONFLICT ("name") DO UPDATE
SET "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."name" IN ('manage_shop_sms_entitlement', 'manage_shop_sms_feature')
WHERE r."name" = 'super_admin'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."name" = 'manage_shop_sms_feature'
WHERE r."name" = 'owner'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
