// app/dashboard/expenses/new/page.tsx

import ExpenseFormClient from "./ExpenseFormClient";
import { createExpense } from "@/app/actions/expenses";
import { getShop } from "@/app/actions/shops";
import { getDhakaDateString } from "@/lib/dhaka-date";
import Link from "next/link";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";

type NewExpensePageProps = {
  searchParams?: Promise<{ shopId?: string } | undefined>;
};

export default async function NewExpensePage({ searchParams }: NewExpensePageProps) {
  const user = await requireUser();
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
  const canCreateExpense = hasPermission(user, "create_expense");
  if (!canCreateExpense) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">নতুন খরচ</h1>
        <p className="mb-2 text-danger font-semibold">অ্যাকসেস সীমাবদ্ধ</p>
        <p className="mb-6 text-muted-foreground">
          নতুন খরচ যোগ করতে <code>create_expense</code> permission লাগবে।
        </p>
        <Link
          href={backHref}
          className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors"
        >
          খরচ তালিকায় ফিরুন
        </Link>
      </div>
    );
  }
  const shop = await getShop(shopId);

  async function handleSubmit(formData: FormData) {
    "use server";

    await createExpense({
      shopId,
      amount: formData.get("amount") as string,
      category: (formData.get("category") as string) || "অন্যান্য",
      expenseDate: (formData.get("expenseDate") as string) || getDhakaDateString(),
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

