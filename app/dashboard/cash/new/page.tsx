// app/dashboard/cash/new/page.tsx

import { createCashEntry } from "@/app/actions/cash";
import { redirect } from "next/navigation";

type NewCashProps = {
  searchParams?: Promise<{ shopId?: string | string[] } | undefined>;
};

export default async function NewCashPage({ searchParams }: NewCashProps) {
  const resolvedSearchParams = await searchParams;
  const shopIdValue = resolvedSearchParams?.shopId;
  const shopId = Array.isArray(shopIdValue) ? shopIdValue[0] : shopIdValue;

  if (!shopId) return <p>You must select a shop first.</p>;

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
    <form action={handleSubmit} className="space-y-3 max-w-lg">
      <h1 className="text-xl font-bold">New Cash Entry</h1>

      <select name="entryType" className="border p-2 w-full">
        <option value="IN">Cash IN</option>
        <option value="OUT">Cash OUT</option>
      </select>

      <input
        name="amount"
        type="number"
        step="0.01"
        className="border p-2 w-full"
        placeholder="Amount"
        required
      />

      <input
        name="reason"
        className="border p-2 w-full"
        placeholder="Reason (optional)"
      />

      <button className="px-4 py-2 bg-black text-white rounded">
        Save Entry
      </button>
    </form>
  );
}
