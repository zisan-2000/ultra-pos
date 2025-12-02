// app/dashboard/shops/[id]/page.tsx

import { getShop, updateShop } from "@/app/actions/shops";
import { redirect } from "next/navigation";
import ShopFormClient from "../ShopFormClient";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditShop({ params }: PageProps) {
  const { id } = await params;
  const shop = await getShop(id);
  if (!shop) {
    return <div className="p-6 text-center text-red-600">Shop not found</div>;
  }
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
        <h1 className="text-3xl font-bold text-gray-900">দোকানের তথ্য সম্পাদনা</h1>
        <p className="text-gray-600 mt-2">ভয়েস + টেমপ্লেট দিয়ে তড়িৎ আপডেট</p>
      </div>

      <ShopFormClient
        backHref={backHref}
        action={handleUpdate}
        initial={{
          name: shop.name || "",
          address: shop.address || "",
          phone: shop.phone || "",
          businessType: (shop.businessType as any) || "tea_stall",
        }}
        submitLabel="✓ দোকান আপডেট করুন"
      />
    </div>
  );
}
