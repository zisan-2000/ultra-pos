export const FEATURE_ACCESS_KEYS = [
  "sales_invoice",
  "queue_token",
  "discount",
  "tax",
  "barcode",
  "sms_summary",
] as const;

export type FeatureAccessKey = (typeof FEATURE_ACCESS_KEYS)[number];

export type FeatureAccessRequestStatus = "pending" | "approved" | "rejected";

export type ShopEntitlementField =
  | "salesInvoiceEntitled"
  | "queueTokenEntitled"
  | "discountFeatureEntitled"
  | "taxFeatureEntitled"
  | "barcodeFeatureEntitled"
  | "smsSummaryEntitled";

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
};

export function isFeatureAccessKey(value: string): value is FeatureAccessKey {
  return FEATURE_ACCESS_KEYS.includes(value as FeatureAccessKey);
}
