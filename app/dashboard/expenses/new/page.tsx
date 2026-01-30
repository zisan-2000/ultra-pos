// app/dashboard/expenses/new/page.tsx

import ExpenseFormClient from "./ExpenseFormClient";
import { createExpense } from "@/app/actions/expenses";
import { getShop } from "@/app/actions/shops";

type NewExpensePageProps = {
  searchParams?: Promise<{ shopId?: string } | undefined>;
};

export default async function NewExpensePage({ searchParams }: NewExpensePageProps) {
  const resolvedSearch = await searchParams;
  const shopId = resolvedSearch?.shopId;

  if (!shopId) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">খরচ যোগ করতে দোকান দরকার</h1>
        <p className="text-muted-foreground">আগে দোকান নির্বাচন করে পুনরায় চেষ্টা করুন</p>
      </div>
    );
  }

  const backHref = `/dashboard/expenses?shopId=${shopId}`;
  const shop = await getShop(shopId);

  async function handleSubmit(formData: FormData) {
    "use server";

    await createExpense({
      shopId,
      amount: formData.get("amount") as string,
      category: (formData.get("category") as string) || "অন্যান্য",
      expenseDate: (formData.get("expenseDate") as string) || new Date().toISOString().slice(0, 10),
      note: (formData.get("note") as string) || "",
    });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <ExpenseFormClient
        shopId={shopId}
        shopName={shop.name}
        backHref={backHref}
        action={handleSubmit}
      />
    </div>
  );
}

