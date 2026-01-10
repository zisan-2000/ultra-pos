// app/dashboard/shops/[id]/page.tsx

import { getShop, updateShop } from "@/app/actions/shops";
import { redirect } from "next/navigation";
import ShopFormClient from "../ShopFormClient";
import { listActiveBusinessTypes } from "@/app/actions/business-types";
import { businessOptions } from "@/lib/productFormConfig";
import { getCurrentUser } from "@/lib/auth-session";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditShop({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  const shop = await getShop(id);
  if (!shop) {
    return <div className="p-6 text-center text-danger">Shop not found</div>;
  }

  const dbBusinessTypes = await listActiveBusinessTypes().catch(() => []);
  const businessTypeOptions = [
    ...dbBusinessTypes.map((t) => ({ id: t.key, label: t.label })),
    ...businessOptions.filter((opt) => !dbBusinessTypes.some((t) => t.key === opt.id)),
  ];

  const backHref = "/dashboard/shops";

  async function handleUpdate(formData: FormData) {
    "use server";

    await updateShop(id, {
      name: formData.get("name"),
      address: formData.get("address"),
      phone: formData.get("phone"),
      businessType: (formData.get("businessType") as any) || "tea_stall",
    });

    redirect("/dashboard/shops");
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">দোকানের তথ্য সম্পাদনা</h1>
        <p className="text-muted-foreground mt-2">নাম + ঠিকানা আপডেট করুন</p>
      </div>

      <ShopFormClient
        backHref={backHref}
        action={handleUpdate}
        cacheUserId={user?.id ?? "anon"}
        shopId={id}
        initial={{
          name: shop.name || "",
          address: shop.address || "",
          phone: shop.phone || "",
          businessType: (shop.businessType as any) || "tea_stall",
        }}
        submitLabel="সংরক্ষণ করুন"
        businessTypeOptions={businessTypeOptions}
      />
    </div>
  );
}
