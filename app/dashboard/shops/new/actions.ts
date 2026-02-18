// app/dashboard/shops/new/actions.ts
"use server";

import { createShop } from "@/app/actions/shops";
import { redirect } from "next/navigation";

export async function handleCreateShop(formData: FormData) {
  const hasInvoiceSettings =
    formData.has("salesInvoiceEnabled") || formData.has("salesInvoicePrefix");
  const hasQueueSettings =
    formData.has("queueTokenEnabled") ||
    formData.has("queueTokenPrefix") ||
    formData.has("queueWorkflow");

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
  });

  redirect("/dashboard/shops");
}
