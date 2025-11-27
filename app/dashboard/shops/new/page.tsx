// app/dashboard/shops/new/page.tsx

import { createShop } from "@/app/actions/shops";
import { redirect } from "next/navigation";

export default function NewShopPage() {
  async function handleSubmit(formData: FormData) {
    "use server";

    await createShop({
      name: formData.get("name") as string,
      address: formData.get("address") as string,
      phone: formData.get("phone") as string,
    });

    redirect("/dashboard/shops");
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">নতুন দোকান তৈরি করুন</h1>
        <p className="text-gray-600 mt-2">আপনার নতুন দোকানের তথ্য প্রবেশ করুন।</p>
      </div>

      <form action={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-8 space-y-6">
        
        {/* Shop Name */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">দোকানের নাম *</label>
          <input
            name="name"
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="যেমন: বাজার রোড, ঢাকা"
          />
          <p className="text-sm text-gray-500">দোকানের অবস্থান।</p>
        </div>

        {/* Phone */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">ফোন নম্বর (ঐচ্ছিক)</label>
          <input 
            name="phone" 
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="যেমন: 01700000000"
          />
          <p className="text-sm text-gray-500">দোকানের যোগাযোগ নম্বর।</p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-4">
          <button 
            type="submit"
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-lg text-lg transition-colors"
          >
            ✓ দোকান তৈরি করুন
          </button>
          <button 
            type="button"
            onClick={() => window.history.back()}
            className="flex-1 border border-slate-300 text-slate-900 font-medium py-4 px-6 rounded-lg text-lg hover:bg-slate-100 transition-colors"
          >
            বাতিল করুন
          </button>
        </div>
      </form>
    </div>
  );
}
