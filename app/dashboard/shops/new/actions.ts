// app/dashboard/shops/new/actions.ts
"use server";

import { createShop } from "@/app/actions/shops";
import { redirect } from "next/navigation";

export async function handleCreateShop(formData: FormData) {
  const hasInvoiceSettings =
    formData.has("salesInvoiceEnabled") ||
    formData.has("salesInvoicePrefix") ||
    formData.has("salesInvoicePrintSize");
  const hasQueueSettings =
    formData.has("queueTokenEnabled") ||
    formData.has("queueTokenPrefix") ||
    formData.has("queueWorkflow");
  const hasDiscountSettings =
    formData.has("discountFeatureEntitled") || formData.has("discountEnabled");
  const hasTaxSettings =
    formData.has("taxFeatureEntitled") ||
    formData.has("taxEnabled") ||
    formData.has("taxLabel") ||
    formData.has("taxRate");
  const hasBarcodeSettings =
    formData.has("barcodeFeatureEntitled") || formData.has("barcodeScanEnabled");
  const hasSmsSettings =
    formData.has("smsSummaryEntitled") || formData.has("smsSummaryEnabled");

  await createShop({
    name: formData.get("name") as string,
    address: formData.get("address") as string,
    phone: formData.get("phone") as string,
    businessType: (formData.get("businessType") as any) || "tea_stall",
    ownerId: (formData.get("ownerId") as string) || undefined,
    ...(hasInvoiceSettings
      ? {
          salesInvoiceEnabled: formData.get("salesInvoiceEnabled") === "1",
          salesInvoicePrefix:
            ((formData.get("salesInvoicePrefix") as string) || "").trim() ||
            null,
          salesInvoicePrintSize:
            ((formData.get("salesInvoicePrintSize") as string) || "").trim() ||
            null,
        }
      : {}),
    ...(hasQueueSettings
      ? {
          queueTokenEnabled: formData.get("queueTokenEnabled") === "1",
          queueTokenPrefix:
            ((formData.get("queueTokenPrefix") as string) || "").trim() ||
            null,
          queueWorkflow:
            ((formData.get("queueWorkflow") as string) || "").trim() || null,
        }
      : {}),
    ...(hasDiscountSettings
      ? {
          discountFeatureEntitled:
            formData.get("discountFeatureEntitled") === "1",
          discountEnabled: formData.get("discountEnabled") === "1",
        }
      : {}),
    ...(hasTaxSettings
      ? {
          taxFeatureEntitled: formData.get("taxFeatureEntitled") === "1",
          taxEnabled: formData.get("taxEnabled") === "1",
          taxLabel: ((formData.get("taxLabel") as string) || "").trim() || null,
          taxRate: ((formData.get("taxRate") as string) || "").trim() || null,
        }
      : {}),
    ...(hasBarcodeSettings
      ? {
          barcodeFeatureEntitled:
            formData.get("barcodeFeatureEntitled") === "1",
          barcodeScanEnabled: formData.get("barcodeScanEnabled") === "1",
        }
      : {}),
    ...(hasSmsSettings
      ? {
          smsSummaryEntitled: formData.get("smsSummaryEntitled") === "1",
          smsSummaryEnabled: formData.get("smsSummaryEnabled") === "1",
        }
      : {}),
  });

  redirect("/dashboard/shops");
}
