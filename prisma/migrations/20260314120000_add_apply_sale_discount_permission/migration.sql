INSERT INTO "Permission" ("id", "name", "description")
VALUES (
  'perm_apply_sale_discount',
  'apply_sale_discount',
  'apply sale discount'
)
ON CONFLICT ("name") DO UPDATE
SET "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."name" = 'apply_sale_discount'
WHERE r."name" IN ('super_admin', 'owner', 'manager')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
