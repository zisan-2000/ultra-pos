// app/dashboard/cash/[id]/page.tsx

import { getCashEntry, updateCashEntry } from "@/app/actions/cash";
import { getShop } from "@/app/actions/shops";
import { redirect } from "next/navigation";
import CashFormClient from "../new/CashFormClient";
import Link from "next/link";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditCashPage({ params }: PageProps) {
  const user = await requireUser();
  const canUpdateCashEntry = hasPermission(user, "update_cash_entry");
  if (!canUpdateCashEntry) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">ক্যাশ এন্ট্রি সম্পাদনা</h1>
        <p className="mb-2 text-danger font-semibold">অ্যাকসেস সীমাবদ্ধ</p>
        <p className="mb-6 text-muted-foreground">
          এন্ট্রি সম্পাদনা করতে <code>update_cash_entry</code> permission লাগবে।
        </p>
        <Link
          href="/dashboard/cash"
          className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors"
        >
          ক্যাশ তালিকায় ফিরুন
        </Link>
      </div>
    );
  }
  const { id } = await params;
  let entry: Awaited<ReturnType<typeof getCashEntry>> | null = null;
  try {
    entry = await getCashEntry(id);
  } catch (err) {
    if (err instanceof Error && /not found/i.test(err.message)) {
      entry = null;
    } else {
      throw err;
    }
  }

  if (!entry) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">ক্যাশ এন্ট্রি পাওয়া যায়নি</h1>
        <p className="text-muted-foreground">তালিকা থেকে আবার চেষ্টা করুন</p>
      </div>
    );
  }
  const entryShopId = entry.shopId;
  const shop = await getShop(entryShopId);
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
    <div className="max-w-2xl mx-auto space-y-4">
      <CashFormClient
        shopId={entryShopId}
        shopName={shop.name}
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
