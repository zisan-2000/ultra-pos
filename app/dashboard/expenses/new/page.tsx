import { createExpense } from "@/app/actions/expenses";
import { redirect } from "next/navigation";

type NewExpensePageProps = {
  searchParams?: {
    shopId?: string;
  };
};

export default function NewExpensePage({ searchParams }: NewExpensePageProps) {
  const shopId = searchParams?.shopId;

  if (!shopId) {
    return <p>You must select a shop first.</p>;
  }

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
    <form action={handleSubmit} className="space-y-4 max-w-lg">
      <h1 className="text-xl font-bold">New Expense</h1>

      <input
        name="amount"
        type="number"
        step="0.01"
        className="border p-2 w-full"
        placeholder="Amount"
        required
      />

      <input
        name="category"
        className="border p-2 w-full"
        placeholder="Category"
        required
      />

      <input
        name="expenseDate"
        type="date"
        className="border p-2 w-full"
        required
      />

      <textarea
        name="note"
        placeholder="Note (optional)"
        className="border p-2 w-full"
      />

      <button className="px-4 py-2 bg-black text-white rounded">
        Save Expense
      </button>
    </form>
  );
}
