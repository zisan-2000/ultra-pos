ALTER TABLE "shops"
ADD COLUMN IF NOT EXISTS "tax_feature_entitled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "tax_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "tax_label" TEXT,
ADD COLUMN IF NOT EXISTS "tax_rate" NUMERIC(5, 2) NOT NULL DEFAULT 0;

ALTER TABLE "sales"
ADD COLUMN IF NOT EXISTS "taxable_amount" NUMERIC(12, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "tax_label" TEXT,
ADD COLUMN IF NOT EXISTS "tax_rate" NUMERIC(5, 2),
ADD COLUMN IF NOT EXISTS "tax_amount" NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE "sale_returns"
ADD COLUMN IF NOT EXISTS "returned_tax_amount" NUMERIC(12, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "exchange_tax_amount" NUMERIC(12, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "tax_label" TEXT,
ADD COLUMN IF NOT EXISTS "tax_rate" NUMERIC(5, 2);

UPDATE "sales"
SET "taxable_amount" = GREATEST(COALESCE("subtotal_amount", 0) - COALESCE("discount_amount", 0), 0)
WHERE COALESCE("taxable_amount", 0) = 0;

INSERT INTO "Permission" ("id", "name", "description")
VALUES
  (
    'perm_manage_shop_tax_entitlement',
    'manage_shop_tax_entitlement',
    'manage shop tax entitlement'
  ),
  (
    'perm_manage_shop_tax_feature',
    'manage_shop_tax_feature',
    'manage shop tax feature'
  )
ON CONFLICT ("name") DO UPDATE
SET "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p
  ON p."name" IN ('manage_shop_tax_entitlement', 'manage_shop_tax_feature')
WHERE r."name" = 'super_admin'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."name" = 'manage_shop_tax_feature'
WHERE r."name" IN ('owner', 'manager')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
