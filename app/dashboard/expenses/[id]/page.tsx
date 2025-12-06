// app/dashboard/expenses/[id]/page.tsx

import { getExpense, updateExpense } from "@/app/actions/expenses";
import { redirect } from "next/navigation";
import ExpenseFormClient from "../new/ExpenseFormClient";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditExpensePage({ params }: PageProps) {
  const { id } = await params;
  const expense = await getExpense(id);

  if (!expense) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">খরচ পাওয়া যায়নি</h1>
        <p className="text-gray-600">তালিকা থেকে আবার চেষ্টা করুন</p>
      </div>
    );
  }

  const expenseShopId = expense.shopId;
  const backHref = `/dashboard/expenses?shopId=${expenseShopId}`;
  const expenseDateDefault = expense.expenseDate
    ? new Date(expense.expenseDate).toISOString().slice(0, 10)
    : "";

  async function handleUpdate(formData: FormData) {
    "use server";

    await updateExpense(id, {
      shopId: expenseShopId,
      amount: formData.get("amount") as string,
      category: (formData.get("category") as string) || "অন্যান্য",
      expenseDate: (formData.get("expenseDate") as string) || expenseDateDefault,
      note: (formData.get("note") as string) || "",
    });

    redirect(`/dashboard/expenses?shopId=${expenseShopId}`);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">খরচ সম্পাদনা করুন</h1>
        <p className="text-gray-600 mt-2">পরিমাণ ও ক্যাটাগরি ঠিক করে সংরক্ষণ করুন</p>
      </div>

      <ExpenseFormClient
        shopId={expenseShopId}
        backHref={backHref}
        action={handleUpdate}
        initialValues={{
          amount: expense.amount?.toString?.() || "",
          category: expense.category || "",
          note: expense.note || "",
          expenseDate: expenseDateDefault,
        }}
        submitLabel="✓ খরচ আপডেট করুন"
      />
    </div>
  );
}
