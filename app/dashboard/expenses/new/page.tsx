// app/dashboard/expenses/new/page.tsx

import { createExpense } from "@/app/actions/expenses";
import Link from "next/link";
import { redirect } from "next/navigation";

type NewExpensePageProps = {
  searchParams?: Promise<{ shopId?: string } | undefined>;
};

export default async function NewExpensePage({
  searchParams,
}: NewExpensePageProps) {
  const resolvedSearch = await searchParams;
  const shopId = resolvedSearch?.shopId;

  if (!shopId) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">দোকান নির্বাচন করা হয়নি</h1>
        <p className="text-gray-600">সঠিক লিঙ্ক ব্যবহার করে আবার চেষ্টা করুন</p>
      </div>
    );
  }

  const backHref = `/dashboard/expenses?shopId=${shopId}`;

  async function handleSubmit(formData: FormData) {
    "use server";

    await createExpense({
      shopId,
      amount: formData.get("amount") as string,
      category: formData.get("category") as string,
      expenseDate: formData.get("expenseDate") as string,
      note: formData.get("note") as string,
    });

    redirect(`/dashboard/expenses?shopId=${shopId}`);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">নতুন খরচ যোগ করুন</h1>
        <p className="text-gray-600 mt-2">পরিমাণ, ক্যাটাগরি ও তারিখ লিখে সংরক্ষণ করুন</p>
      </div>

      <form action={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-8 space-y-6">
        
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

        {/* Category */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">খরচের ক্যাটাগরি *</label>
          <select
            name="category"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            required
          >
            <option value="">-- একটি ক্যাটাগরি নির্বাচন করুন --</option>
            <option value="ভাড়া">ভাড়া</option>
            <option value="বেতন">বেতন</option>
            <option value="বিল">বিল</option>
            <option value="পরিবহন">পরিবহন</option>
            <option value="মার্কেটিং">মার্কেটিং</option>
            <option value="রক্ষণাবেক্ষণ">রক্ষণাবেক্ষণ</option>
            <option value="অন্যান্য">অন্যান্য</option>
          </select>
          <p className="text-sm text-gray-500">উপযুক্ত ক্যাটাগরি বেছে নিন</p>
        </div>

        {/* Expense Date */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">খরচের তারিখ *</label>
          <input
            name="expenseDate"
            type="date"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            required
          />
          <p className="text-sm text-gray-500">তারিখ নির্বাচন করুন</p>
        </div>

        {/* Note */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">নোট (ঐচ্ছিক)</label>
          <textarea
            name="note"
            placeholder="যেমন: মার্চ মাসের বিদ্যুৎ বিল..."
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            rows={4}
          />
          <p className="text-sm text-gray-500">প্রয়োজনে সংক্ষিপ্ত নোট লিখতে পারেন</p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-4">
          <button 
            type="submit"
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg text-lg transition-colors"
          >
            খরচ সংরক্ষণ করুন
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
