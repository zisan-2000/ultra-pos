// app/dashboard/cash/new/page.tsx

import CashFormClient from "./CashFormClient";
import { createCashEntry } from "@/app/actions/cash";
import { getShop } from "@/app/actions/shops";
import { redirect } from "next/navigation";

type NewCashProps = {
  searchParams?: Promise<{ shopId?: string | string[] } | undefined>;
};

export default async function NewCashPage({ searchParams }: NewCashProps) {
  const resolvedSearchParams = await searchParams;
  const shopIdValue = resolvedSearchParams?.shopId;
  const shopId = Array.isArray(shopIdValue) ? shopIdValue[0] : shopIdValue;

  if (!shopId) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">ক্যাশ এন্ট্রির জন্য দোকান দরকার</h1>
        <p className="text-muted-foreground">আগে দোকান নির্বাচন করে পুনরায় চেষ্টা করুন</p>
      </div>
    );
  }

  const backHref = `/dashboard/cash?shopId=${shopId}`;
  const shop = await getShop(shopId);

  async function handleSubmit(formData: FormData) {
    "use server";

    await createCashEntry({
      shopId,
      entryType: (formData.get("entryType") as string) || "IN",
      amount: formData.get("amount") as string,
      reason: (formData.get("reason") as string) || "",
    });

    redirect(backHref);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <CashFormClient
        shopId={shopId}
        shopName={shop.name}
        backHref={backHref}
        action={handleSubmit}
      />
    </div>
  );
}
