// app/dashboard/cash/[id]/page.tsx

import { getCashEntry, updateCashEntry } from "@/app/actions/cash";
import { redirect } from "next/navigation";
import CashFormClient from "../new/CashFormClient";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditCashPage({ params }: PageProps) {
  const { id } = await params;
  const entry = await getCashEntry(id);

  if (!entry) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">ক্যাশ এন্ট্রি পাওয়া যায়নি</h1>
        <p className="text-gray-600">তালিকা থেকে আবার চেষ্টা করুন</p>
      </div>
    );
  }
  const entryShopId = entry.shopId;
  const backHref = `/dashboard/cash?shopId=${entryShopId}`;

  async function handleSubmit(formData: FormData) {
    "use server";

    await updateCashEntry(id, {
      shopId: entryShopId,
      entryType: formData.get("entryType") as string,
      amount: formData.get("amount") as string,
      reason: formData.get("reason") as string,
    });

    redirect(`/dashboard/cash?shopId=${entryShopId}`);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">ক্যাশ এন্ট্রি সম্পাদনা</h1>
        <p className="text-gray-600 mt-2">ভয়েস ও টেমপ্লেট দিয়ে দ্রুত পরিবর্তন করুন</p>
      </div>

      <CashFormClient
        shopId={entryShopId}
        backHref={backHref}
        action={handleSubmit}
        id={id}
        initialValues={{
          entryType: (entry.entryType as "IN" | "OUT") || "IN",
          amount: entry.amount?.toString?.() || "",
          reason: entry.reason || "",
        }}
        submitLabel="✓ ক্যাশ আপডেট করুন"
      />
    </div>
  );
}
