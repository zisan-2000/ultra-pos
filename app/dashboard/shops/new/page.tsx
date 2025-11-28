// app/dashboard/shops/new/page.tsx

import { createShop } from "@/app/actions/shops";
import { businessOptions, type BusinessType } from "@/lib/productFormConfig";
import Link from "next/link";
import { redirect } from "next/navigation";

export default function NewShopPage() {
  const backHref = "/dashboard/shops";

  async function handleSubmit(formData: FormData) {
    "use server";

    await createShop({
      name: formData.get("name") as string,
      address: formData.get("address") as string,
      phone: formData.get("phone") as string,
      businessType: (formData.get("businessType") as BusinessType) || "tea_stall",
    });

    redirect("/dashboard/shops");
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">নতুন দোকান তৈরি করুন</h1>
        <p className="text-gray-600 mt-2">দোকানের নাম, ঠিকানা, ফোন ও ধরন একসাথে সংরক্ষণ করুন।</p>
      </div>

      <form action={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-8 space-y-6">
        
        {/* Shop Name */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">দোকানের নাম *</label>
          <input
            name="name"
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="যেমন: এম/এস রহমান স্টোর"
            required
          />
          <p className="text-sm text-gray-500">সংক্ষিপ্ত ও পরিষ্কার নাম লিখুন।</p>
        </div>

        {/* Address */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">ঠিকানা (ঐচ্ছিক)</label>
          <input
            name="address"
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="যেমন: ১২/৩ স্টেশন রোড, ঢাকা"
          />
          <p className="text-sm text-gray-500">লোকেশন জানাতে সহায়ক হবে।</p>
        </div>

        {/* Phone */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">দোকানের ফোন (ঐচ্ছিক)</label>
          <input 
            name="phone" 
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="যেমন: 01700000000"
          />
          <p className="text-sm text-gray-500">যোগাযোগের জন্য ব্যবহারযোগ্য নম্বর দিন।</p>
        </div>

        {/* Business Type */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">ব্যবসার ধরন</label>
          <select
            name="businessType"
            defaultValue="tea_stall"
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            {businessOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
          <p className="text-sm text-gray-500">এটাই নির্ধারণ করবে পণ্য ফর্মে কোন ফিল্ড দেখাবে।</p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-4">
          <button 
            type="submit"
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-lg text-lg transition-colors"
          >
            দোকান তৈরি করুন
          </button>
          <Link 
            href={backHref}
            className="flex-1 border border-slate-300 text-slate-900 font-medium py-4 px-6 rounded-lg text-lg hover:bg-slate-100 transition-colors text-center"
          >
            ফিরে যান
          </Link>
        </div>
      </form>
    </div>
  );
}
