-- Add manager role + manager creation permission.
INSERT INTO "Permission" ("id", "name", "description")
VALUES ('perm_create_user_manager', 'create_user_manager', 'create user manager')
ON CONFLICT ("name") DO UPDATE
SET "description" = EXCLUDED."description";

INSERT INTO "Role" ("id", "name", "description")
VALUES ('role_manager', 'manager', 'manager role')
ON CONFLICT ("name") DO UPDATE
SET "description" = EXCLUDED."description";

-- Owner can create manager users.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."name" = 'create_user_manager'
WHERE r."name" = 'owner'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Manager role starts with owner-like operational permissions and can create staff.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p
  ON p."name" IN (
    'view_shops',
    'switch_shop',
    'manage_shop_invoice_feature',
    'manage_shop_queue_feature',
    'manage_shop_barcode_feature',
    'view_products',
    'create_product',
    'update_product',
    'delete_product',
    'update_product_stock',
    'update_product_price',
    'manage_product_status',
    'view_purchases',
    'create_purchase',
    'view_suppliers',
    'create_supplier',
    'create_purchase_payment',
    'view_sales',
    'view_sale_details',
    'view_sales_invoice',
    'view_sale_return',
    'create_sale',
    'create_sale_return',
    'use_pos_barcode_scan',
    'issue_sales_invoice',
    'view_queue_board',
    'create_queue_token',
    'update_queue_token_status',
    'print_queue_token',
    'update_sale',
    'cancel_sale',
    'create_due_sale',
    'take_due_payment_from_sale',
    'view_customers',
    'create_customer',
    'update_customer',
    'delete_customer',
    'view_due_summary',
    'view_customer_due',
    'create_due_entry',
    'take_due_payment',
    'writeoff_due',
    'view_expenses',
    'create_expense',
    'update_expense',
    'delete_expense',
    'view_cashbook',
    'create_cash_entry',
    'update_cash_entry',
    'delete_cash_entry',
    'view_reports',
    'view_sales_report',
    'view_expense_report',
    'view_cashbook_report',
    'view_profit_report',
    'view_payment_method_report',
    'view_top_products_report',
    'view_low_stock_report',
    'export_reports',
    'view_users_under_me',
    'create_user_staff',
    'edit_users_under_me',
    'delete_users_under_me',
    'view_settings',
    'view_dashboard_summary',
    'use_offline_pos',
    'sync_offline_data'
  )
WHERE r."name" = 'manager'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
