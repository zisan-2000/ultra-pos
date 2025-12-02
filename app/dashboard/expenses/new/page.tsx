// app/dashboard/expenses/new/page.tsx

import ExpenseFormClient from "./ExpenseFormClient";
import { createExpense } from "@/app/actions/expenses";
import { redirect } from "next/navigation";

type NewExpensePageProps = {
  searchParams?: Promise<{ shopId?: string } | undefined>;
};

export default async function NewExpensePage({ searchParams }: NewExpensePageProps) {
  const resolvedSearch = await searchParams;
  const shopId = resolvedSearch?.shopId;

  if (!shopId) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">খরচ যোগ করতে দোকান দরকার</h1>
        <p className="text-gray-600">আগে দোকান নির্বাচন করে পুনরায় চেষ্টা করুন</p>
      </div>
    );
  }

  const backHref = `/dashboard/expenses?shopId=${shopId}`;

  async function handleSubmit(formData: FormData) {
    "use server";

    await createExpense({
      shopId,
      amount: formData.get("amount") as string,
      category: (formData.get("category") as string) || "অন্যান্য",
      expenseDate: (formData.get("expenseDate") as string) || new Date().toISOString().slice(0, 10),
      note: (formData.get("note") as string) || "",
    });

    redirect(backHref);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">খরচ দ্রুত যোগ করুন</h1>
        <p className="text-gray-600 mt-2">ভয়েস + এক-ট্যাপ টেমপ্লেট দিয়ে মিনিটে হিসাব সম্পন্ন</p>
      </div>

      <ExpenseFormClient shopId={shopId} backHref={backHref} action={handleSubmit} />
    </div>
  );
}
