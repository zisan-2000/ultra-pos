// app/dashboard/expenses/[id]/page.tsx

import { getExpense, updateExpense } from "@/app/actions/expenses";
import { getShop } from "@/app/actions/shops";
import ExpenseFormClient from "../new/ExpenseFormClient";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditExpensePage({ params }: PageProps) {
  const { id } = await params;
  let expense: Awaited<ReturnType<typeof getExpense>> | null = null;
  try {
    expense = await getExpense(id);
  } catch (err) {
    if (err instanceof Error && /not found/i.test(err.message)) {
      expense = null;
    } else {
      throw err;
    }
  }

  if (!expense) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">খরচ পাওয়া যায়নি</h1>
        <p className="text-muted-foreground">তালিকা থেকে আবার চেষ্টা করুন</p>
      </div>
    );
  }

  const expenseShopId = expense.shopId;
  const shop = await getShop(expenseShopId);
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
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <ExpenseFormClient
        shopId={expenseShopId}
        shopName={shop.name}
        backHref={backHref}
        action={handleUpdate}
        id={id}
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
