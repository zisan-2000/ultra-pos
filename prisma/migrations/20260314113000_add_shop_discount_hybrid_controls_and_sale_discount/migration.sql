ALTER TABLE "shops"
ADD COLUMN IF NOT EXISTS "discount_feature_entitled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "discount_enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "sales"
ADD COLUMN IF NOT EXISTS "subtotal_amount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "discount_type" TEXT,
ADD COLUMN IF NOT EXISTS "discount_value" DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS "discount_amount" DECIMAL(12, 2) NOT NULL DEFAULT 0;

UPDATE "sales"
SET
  "subtotal_amount" = COALESCE("total_amount", 0),
  "discount_amount" = COALESCE("discount_amount", 0)
WHERE COALESCE("subtotal_amount", 0) = 0;

INSERT INTO "Permission" ("id", "name", "description")
VALUES
  (
    'perm_manage_shop_discount_entitlement',
    'manage_shop_discount_entitlement',
    'manage shop discount entitlement'
  ),
  (
    'perm_manage_shop_discount_feature',
    'manage_shop_discount_feature',
    'manage shop discount feature'
  )
ON CONFLICT ("name") DO UPDATE
SET "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p
  ON p."name" IN ('manage_shop_discount_entitlement', 'manage_shop_discount_feature')
WHERE r."name" = 'super_admin'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."name" = 'manage_shop_discount_feature'
WHERE r."name" IN ('owner', 'manager')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
