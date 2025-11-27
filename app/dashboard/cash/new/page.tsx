// app/dashboard/cash/new/page.tsx

import { createCashEntry } from "@/app/actions/cash";
import Link from "next/link";
import { redirect } from "next/navigation";

type NewCashProps = {
  searchParams?: Promise<{ shopId?: string | string[] } | undefined>;
};

export default async function NewCashPage({ searchParams }: NewCashProps) {
  const resolvedSearchParams = await searchParams;
  const shopIdValue = resolvedSearchParams?.shopId;
  const shopId = Array.isArray(shopIdValue) ? shopIdValue[0] : shopIdValue;

  if (!shopId) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">দোকান পাওয়া যায়নি</h1>
        <p className="text-gray-600">সঠিক লিঙ্ক ব্যবহার করে আবার চেষ্টা করুন</p>
      </div>
    );
  }

  const backHref = `/dashboard/cash?shopId=${shopId}`;

  async function handleSubmit(formData: FormData) {
    "use server";

    await createCashEntry({
      shopId,
      entryType: formData.get("entryType") as string,
      amount: formData.get("amount") as string,
      reason: formData.get("reason") as string,
    });

    redirect(`/dashboard/cash?shopId=${shopId}`);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">নতুন ক্যাশ এন্ট্রি যোগ করুন</h1>
        <p className="text-gray-600 mt-2">দোকানের জন্য ক্যাশ ইন/আউট যুক্ত করুন</p>
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
          />
          <p className="text-sm text-gray-500">সংক্ষেপে কারণ লিখতে পারেন</p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-4">
          <button 
            type="submit"
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg text-lg transition-colors"
          >
            এন্ট্রি সংরক্ষণ করুন
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
