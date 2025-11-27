// app/dashboard/expenses/[id]/page.tsx

import { getExpense, updateExpense } from "@/app/actions/expenses";
import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditExpensePage({ params }: PageProps) {
  const { id } = await params;
  const expense = await getExpense(id);

  if (!expense) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">খরচ পাওয়া যায়নি</h1>
        <p className="text-gray-600">এই খরচটি আর নেই।</p>
      </div>
    );
  }
  const expenseShopId = expense.shopId;

  async function handleUpdate(formData: FormData) {
    "use server";

    await updateExpense(id, {
      shopId: expenseShopId,
      amount: formData.get("amount") as string,
      category: formData.get("category") as string,
      expenseDate: formData.get("expenseDate") as string,
      note: formData.get("note") as string,
    });

    redirect(`/dashboard/expenses?shopId=${expenseShopId}`);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">খরচ সম্পাদনা করুন</h1>
        <p className="text-gray-600 mt-2">খরচের তথ্য পরিবর্তন করুন এবং সংরক্ষণ করুন।</p>
      </div>

      <form action={handleUpdate} className="bg-white rounded-lg border border-gray-200 p-8 space-y-6">
        
        {/* Amount */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">খরচের পরিমাণ (৳) *</label>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            defaultValue={expense.amount}
            required
          />
          <p className="text-sm text-gray-500">কত টাকা খরচ হয়েছে।</p>
        </div>

        {/* Category */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">খরচের ধরন *</label>
          <select
            name="category"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            defaultValue={expense.category}
            required
          >
            <option value="">-- খরচের ধরন বাছাই করুন --</option>
            <option value="ভাড়া">ভাড়া</option>
            <option value="বিদ্যুৎ">বিদ্যুৎ</option>
            <option value="পানি">পানি</option>
            <option value="মজুরি">মজুরি</option>
            <option value="পরিবহন">পরিবহন</option>
            <option value="মেরামত">মেরামত</option>
            <option value="অন্যান্য">অন্যান্য</option>
          </select>
          <p className="text-sm text-gray-500">খরচ কী ধরনের তা বাছাই করুন।</p>
        </div>

        {/* Expense Date */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">খরচের তারিখ *</label>
          <input
            name="expenseDate"
            type="date"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            defaultValue={expense.expenseDate || ""}
            required
          />
          <p className="text-sm text-gray-500">খরচ কখন হয়েছে।</p>
        </div>

        {/* Note */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">বিবরণ (ঐচ্ছিক)</label>
          <textarea
            name="note"
            placeholder="যেমন: দোকানের সামনে দেয়াল মেরামত..."
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            rows={4}
            defaultValue={expense.note || ""}
          />
          <p className="text-sm text-gray-500">খরচ সম্পর্কে অতিরিক্ত তথ্য লিখুন।</p>
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
