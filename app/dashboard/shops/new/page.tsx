// app/dashboard/shops/new/page.tsx

import ShopFormClient from "../ShopFormClient";
import { handleCreateShop } from "./actions";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth-session";
import { getOwnerOptions } from "@/app/actions/shops";
import { listActiveBusinessTypes } from "@/app/actions/business-types";
import { businessOptions } from "@/lib/productFormConfig";

export default async function NewShopPage() {
  const backHref = "/dashboard/shops";
  const user = await getCurrentUser();
  const isSuperAdmin = user?.roles?.includes("super_admin") ?? false;

  if (!isSuperAdmin) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900">অনুমতি নেই</h1>
          <p className="mt-2 text-sm text-gray-600">
            শুধুমাত্র সুপার অ্যাডমিন নতুন দোকান যোগ করতে পারেন।
          </p>
          <Link
            href={backHref}
            className="inline-flex items-center justify-center mt-6 px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            ফিরে যান
          </Link>
        </div>
      </div>
    );
  }

  const ownerOptions = await getOwnerOptions();
  const dbBusinessTypes = await listActiveBusinessTypes().catch(() => []);
  const mergedBusinessTypes = [
    ...dbBusinessTypes.map((t) => ({ id: t.key, label: t.label })),
    ...businessOptions.filter((opt) => !dbBusinessTypes.some((t) => t.key === opt.id)),
  ];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">নতুন দোকান যোগ করুন</h1>
        <p className="text-gray-600 mt-2">মৌলিক তথ্য, ঠিকানা, যোগাযোগ ও ব্যবসার ধরন যুক্ত করুন</p>
      </div>

      <ShopFormClient
        backHref={backHref}
        action={handleCreateShop}
        ownerOptions={ownerOptions}
        businessTypeOptions={mergedBusinessTypes}
      />
    </div>
  );
}
