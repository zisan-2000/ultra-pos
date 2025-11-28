// app/dashboard/cash/[id]/page.tsx

import { getCashEntry, updateCashEntry } from "@/app/actions/cash";
import Link from "next/link";
import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditCashPage({ params }: PageProps) {
  const { id } = await params;
  const entry = await getCashEntry(id);

  if (!entry) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">ক্যাশ এন্ট্রি পাওয়া যায়নি</h1>
        <p className="text-gray-600">তালিকা থেকে আবার চেষ্টা করুন</p>
      </div>
    );
  }
  const entryShopId = entry.shopId;
  const backHref = `/dashboard/cash?shopId=${entryShopId}`;

  async function handleSubmit(formData: FormData) {
    "use server";

    await updateCashEntry(id, {
      shopId: entryShopId,
      entryType: formData.get("entryType") as string,
      amount: formData.get("amount") as string,
      reason: formData.get("reason") as string,
    });

    redirect(`/dashboard/cash?shopId=${entryShopId}`);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">ক্যাশ এন্ট্রি সম্পাদনা করুন</h1>
        <p className="text-gray-600 mt-2">তথ্য ঠিক করে সংরক্ষণ করুন</p>
      </div>

      <form action={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-8 space-y-6">
        
        {/* Entry Type */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">এন্ট্রি টাইপ *</label>
          <div className="grid grid-cols-2 gap-4">
            {[
              { value: "IN", label: "নগদ জমা (IN)" },
              { value: "OUT", label: "নগদ খরচ (OUT)" },
            ].map((type) => (
              <label key={type.value} className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="radio" 
                  name="entryType" 
                  value={type.value}
                  defaultChecked={entry.entryType === type.value}
                  className="w-5 h-5 cursor-pointer"
                  required
                />
                <span className="text-base text-gray-900">{type.label}</span>
              </label>
            ))}
          </div>
          <p className="text-sm text-gray-500">ক্যাশ প্রবাহ নির্বাচন করুন</p>
        </div>

        {/* Amount */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">টাকার পরিমাণ (৳) *</label>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            defaultValue={entry.amount}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="যেমন: 500, 1000.50"
            required
          />
          <p className="text-sm text-gray-500">শূন্যের কম মান গ্রহণযোগ্য নয়</p>
        </div>

        {/* Reason */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">কারণ (ঐচ্ছিক)</label>
          <input
            name="reason"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="যেমন: বিক্রি, ক্রয়, বেতন..."
            defaultValue={entry.reason || ""}
          />
          <p className="text-sm text-gray-500">সংক্ষেপে কারণ লিখতে পারেন</p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-4">
          <button 
            type="submit"
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg text-lg transition-colors"
          >
            পরিবর্তন সংরক্ষণ করুন
          </button>
          <Link 
            href={backHref}
            className="flex-1 border border-gray-300 text-gray-900 font-medium py-4 px-6 rounded-lg text-lg hover:bg-gray-100 transition-colors text-center"
          >
            বাতিল
          </Link>
        </div>
      </form>
    </div>
  );
}
