// app/dashboard/shops/new/actions.ts
"use server";

import { createShop } from "@/app/actions/shops";
import { redirect } from "next/navigation";

export async function handleCreateShop(formData: FormData) {
  await createShop({
    name: formData.get("name") as string,
    address: formData.get("address") as string,
    phone: formData.get("phone") as string,
    businessType: (formData.get("businessType") as any) || "tea_stall",
  });

  redirect("/dashboard/shops");
}
