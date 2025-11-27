// app/dashboard/shops/[id]/page.tsx

import { getShop, updateShop } from "@/app/actions/shops";
import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditShop({ params }: PageProps) {
  const { id } = await params;
  const shop = await getShop(id);

  async function handleUpdate(formData: FormData) {
    "use server";

    await updateShop(id, {
      name: formData.get("name"),
      address: formData.get("address"),
      phone: formData.get("phone"),
    });

    redirect("/dashboard/shops");
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">দোকান সম্পাদনা করুন</h1>
        <p className="text-gray-600 mt-2">দোকানের তথ্য পরিবর্তন করুন এবং সংরক্ষণ করুন।</p>
      </div>

      <form action={handleUpdate} className="bg-white rounded-lg border border-gray-200 p-8 space-y-6">
        
        {/* Shop Name */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">দোকানের নাম *</label>
          <input
            name="name"
            defaultValue={shop?.name}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="যেমন: আমাদের দোকান"
            required
          />
          <p className="text-sm text-gray-500">আপনার দোকানের নাম কী।</p>
        </div>

        {/* Address */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">ঠিকানা (ঐচ্ছিক)</label>
          <input
            name="address"
            defaultValue={shop?.address ?? ""}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="যেমন: বাজার রোড, ঢাকা"
          />
          <p className="text-sm text-gray-500">দোকানের অবস্থান।</p>
        </div>

        {/* Phone */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">ফোন নম্বর (ঐচ্ছিক)</label>
          <input
            name="phone"
            defaultValue={shop?.phone ?? ""}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="যেমন: 01700000000"
          />
          <p className="text-sm text-gray-500">দোকানের যোগাযোগ নম্বর।</p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-4">
          <button 
            type="submit"
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg text-lg transition-colors"
          >
            ✓ পরিবর্তন সংরক্ষণ করুন
          </button>
          <button 
            type="button"
            onClick={() => window.history.back()}
            className="flex-1 border border-gray-300 text-gray-900 font-medium py-4 px-6 rounded-lg text-lg hover:bg-gray-100 transition-colors"
          >
            বাতিল করুন
          </button>
        </div>
      </form>
    </div>
  );
}
