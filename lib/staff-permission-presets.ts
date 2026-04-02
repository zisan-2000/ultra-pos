export const STAFF_PERMISSION_PRESET_KEYS = [
  "cashier",
  "counter_due",
  "inventory",
  "shop_operator",
] as const;

export type StaffPermissionPresetKey =
  (typeof STAFF_PERMISSION_PRESET_KEYS)[number];

export type StaffPermissionPreset = {
  key: StaffPermissionPresetKey;
  label: string;
  description: string;
  permissionNames: string[];
};

export const DEFAULT_STAFF_PERMISSION_PRESET: StaffPermissionPresetKey =
  "cashier";

export const STAFF_PERMISSION_PRESETS: StaffPermissionPreset[] = [
  {
    key: "cashier",
    label: "Cashier",
    description: "বিক্রি, ইনভয়েস, কাস্টমার এবং POS স্ক্যান",
    permissionNames: [
      "view_dashboard_summary",
      "view_products",
      "view_sales",
      "view_sale_details",
      "view_sales_invoice",
      "view_sale_return",
      "create_sale",
      "create_sale_return",
      "use_pos_barcode_scan",
      "issue_sales_invoice",
      "view_customers",
      "create_customer",
      "create_due_sale",
      "take_due_payment_from_sale",
      "use_offline_pos",
      "sync_offline_data",
    ],
  },
  {
    key: "counter_due",
    label: "Counter + Due",
    description: "Cashier access + বাকি/পাওনা ও টোকেন কাউন্টার কাজ",
    permissionNames: [
      "view_dashboard_summary",
      "view_products",
      "view_sales",
      "view_sale_details",
      "view_sales_invoice",
      "view_sale_return",
      "create_sale",
      "create_sale_return",
      "use_pos_barcode_scan",
      "issue_sales_invoice",
      "view_queue_board",
      "create_queue_token",
      "update_queue_token_status",
      "print_queue_token",
      "create_due_sale",
      "take_due_payment_from_sale",
      "view_customers",
      "create_customer",
      "update_customer",
      "view_due_summary",
      "view_customer_due",
      "create_due_entry",
      "take_due_payment",
      "use_offline_pos",
      "sync_offline_data",
    ],
  },
  {
    key: "inventory",
    label: "Inventory",
    description: "পণ্য, স্টক, ক্রয় ও supplier intake কাজ",
    permissionNames: [
      "view_dashboard_summary",
      "view_products",
      "create_product",
      "update_product",
      "update_product_stock",
      "update_product_price",
      "manage_product_status",
      "view_purchases",
      "create_purchase",
      "view_suppliers",
      "create_supplier",
      "use_offline_pos",
      "sync_offline_data",
    ],
  },
  {
    key: "shop_operator",
    label: "Shop Operator",
    description: "দৈনন্দিন দোকান চালনা: sales, due, expense, cash, queue",
    permissionNames: [
      "view_dashboard_summary",
      "view_products",
      "create_product",
      "update_product",
      "update_product_stock",
      "view_sales",
      "view_sale_details",
      "view_sales_invoice",
      "view_sale_return",
      "create_sale",
      "create_sale_return",
      "use_pos_barcode_scan",
      "issue_sales_invoice",
      "view_queue_board",
      "create_queue_token",
      "update_queue_token_status",
      "print_queue_token",
      "create_due_sale",
      "take_due_payment_from_sale",
      "view_customers",
      "create_customer",
      "update_customer",
      "view_due_summary",
      "view_customer_due",
      "create_due_entry",
      "take_due_payment",
      "view_expenses",
      "create_expense",
      "view_cashbook",
      "create_cash_entry",
      "use_offline_pos",
      "sync_offline_data",
    ],
  },
];

export function getStaffPermissionPreset(
  key?: string | null,
): StaffPermissionPreset {
  return (
    STAFF_PERMISSION_PRESETS.find((preset) => preset.key === key) ??
    STAFF_PERMISSION_PRESETS.find(
      (preset) => preset.key === DEFAULT_STAFF_PERMISSION_PRESET,
    )!
  );
}
