import { getCashEntry, updateCashEntry } from "@/app/actions/cash";
import { redirect } from "next/navigation";

export default async function EditCashPage({ params }: any) {
  const entry = await getCashEntry(params.id);

  if (!entry) return <p>Cash entry not found.</p>;

  async function handleSubmit(formData: FormData) {
    "use server";

    await updateCashEntry(params.id, {
      shopId: entry.shopId,
      entryType: formData.get("entryType") as string,
      amount: formData.get("amount") as string,
      reason: formData.get("reason") as string,
    });

    redirect(`/dashboard/cash?shopId=${entry.shopId}`);
  }

  return (
    <form action={handleSubmit} className="space-y-3 max-w-lg">
      <h1 className="text-xl font-bold">Edit Cash Entry</h1>

      <select
        name="entryType"
        className="border p-2 w-full"
        defaultValue={entry.entryType}
      >
        <option value="IN">Cash IN</option>
        <option value="OUT">Cash OUT</option>
      </select>

      <input
        name="amount"
        className="border p-2 w-full"
        type="number"
        step="0.01"
        defaultValue={entry.amount}
      />

      <input
        name="reason"
        className="border p-2 w-full"
        defaultValue={entry.reason || ""}
      />

      <button className="px-4 py-2 bg-black text-white rounded">
        Update Entry
      </button>
    </form>
  );
}
