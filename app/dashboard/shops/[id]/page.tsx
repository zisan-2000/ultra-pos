// app/dashboard/shops/[id]/page.tsx

import { getShop, updateShop } from "@/app/actions/shops";
import Link from "next/link";
import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditShop({ params }: PageProps) {
  const { id } = await params;
  const shop = await getShop(id);
  const backHref = "/dashboard/shops";

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
        <h1 className="text-3xl font-bold text-gray-900">দোকানের তথ্য সম্পাদনা করুন</h1>
        <p className="text-gray-600 mt-2">দোকানের নাম ও যোগাযোগের তথ্য আপডেট করে সংরক্ষণ করুন</p>
      </div>

      <form action={handleUpdate} className="bg-white rounded-lg border border-gray-200 p-8 space-y-6">
        
        {/* Shop Name */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">দোকানের নাম *</label>
          <input
            name="name"
            defaultValue={shop?.name}
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="যেমন: আলীর স্টোর"
            required
          />
          <p className="text-sm text-gray-500">এই নাম ইনভয়েস এবং রিপোর্টে ব্যবহৃত হবে</p>
        </div>

        {/* Address */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">ঠিকানা (ঐচ্ছিক)</label>
          <input
            name="address"
            defaultValue={shop?.address ?? ""}
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="যেমন: ১২৩ প্রধান সড়ক, ঢাকা"
          />
          <p className="text-sm text-gray-500">শাখা বা এলাকার ঠিকানা লিখতে পারেন</p>
        </div>

        {/* Phone */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">যোগাযোগ নম্বর (ঐচ্ছিক)</label>
          <input
            name="phone"
            defaultValue={shop?.phone ?? ""}
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="যেমন: 01700000000"
          />
          <p className="text-sm text-gray-500">গ্রাহক বা সরবরাহকারীর সাথে যোগাযোগের জন্য</p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-4">
          <button 
            type="submit"
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-lg text-lg transition-colors"
          >
            পরিবর্তন সংরক্ষণ করুন
          </button>
          <Link 
            href={backHref}
            className="flex-1 border border-slate-300 text-slate-900 font-medium py-4 px-6 rounded-lg text-lg hover:bg-slate-100 transition-colors text-center"
          >
            বাতিল
          </Link>
        </div>
      </form>
    </div>
  );
}
