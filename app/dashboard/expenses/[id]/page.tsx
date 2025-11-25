// app/dashboard/expenses/[id]/page.tsx

import { getExpense, updateExpense } from "@/app/actions/expenses";
import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditExpensePage({ params }: PageProps) {
  const { id } = await params;
  const expense = await getExpense(id);

  if (!expense) {
    return <p>Expense not found</p>;
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
    <form action={handleUpdate} className="space-y-4 max-w-lg">
      <h1 className="text-xl font-bold">Edit Expense</h1>

      <input
        name="amount"
        type="number"
        step="0.01"
        className="border p-2 w-full"
        defaultValue={expense.amount}
      />

      <input
        name="category"
        className="border p-2 w-full"
        defaultValue={expense.category}
      />

      <input
        name="expenseDate"
        type="date"
        className="border p-2 w-full"
        defaultValue={expense.expenseDate || ""}
      />

      <textarea
        name="note"
        className="border p-2 w-full"
        defaultValue={expense.note || ""}
      />

      <button className="px-4 py-2 bg-black text-white rounded">
        Update Expense
      </button>
    </form>
  );
}
