export const FEATURE_ACCESS_KEYS = [
  "sales_invoice",
  "queue_token",
  "discount",
  "tax",
  "barcode",
  "sms_summary",
  "inventory_cogs",
  "cogs_analytics",
] as const;

export type FeatureAccessKey = (typeof FEATURE_ACCESS_KEYS)[number];

export type FeatureAccessRequestStatus = "pending" | "approved" | "rejected";

export type ShopEntitlementField =
  | "salesInvoiceEntitled"
  | "queueTokenEntitled"
  | "discountFeatureEntitled"
  | "taxFeatureEntitled"
  | "barcodeFeatureEntitled"
  | "smsSummaryEntitled"
  | "inventoryFeatureEntitled"
  | "cogsFeatureEntitled";

export const FEATURE_ACCESS_META: Record<
  FeatureAccessKey,
  {
    title: string;
    banglaTitle: string;
    entitlementField: ShopEntitlementField;
  }
> = {
  sales_invoice: {
    title: "Sales Invoice",
    banglaTitle: "Sales Invoice",
    entitlementField: "salesInvoiceEntitled",
  },
  queue_token: {
    title: "Queue Token",
    banglaTitle: "Queue Token",
    entitlementField: "queueTokenEntitled",
  },
  discount: {
    title: "Discount",
    banglaTitle: "Discount",
    entitlementField: "discountFeatureEntitled",
  },
  tax: {
    title: "VAT/Tax",
    banglaTitle: "VAT/Tax",
    entitlementField: "taxFeatureEntitled",
  },
  barcode: {
    title: "Barcode Scan",
    banglaTitle: "Barcode Scan",
    entitlementField: "barcodeFeatureEntitled",
  },
  sms_summary: {
    title: "SMS Summary",
    banglaTitle: "SMS Summary",
    entitlementField: "smsSummaryEntitled",
  },
  inventory_cogs: {
    title: "Purchases + Suppliers",
    banglaTitle: "পণ্য ক্রয় + সরবরাহকারী",
    entitlementField: "inventoryFeatureEntitled",
  },
  cogs_analytics: {
    title: "COGS Analytics",
    banglaTitle: "COGS লাভ বিশ্লেষণ",
    entitlementField: "cogsFeatureEntitled",
  },
};

export function isFeatureAccessKey(value: string): value is FeatureAccessKey {
  return FEATURE_ACCESS_KEYS.includes(value as FeatureAccessKey);
}
