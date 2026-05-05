import Link from "next/link";
import { getDhakaDateString } from "@/lib/dhaka-date";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import { getPurchaseReturnContext } from "@/app/actions/purchases";
import PurchaseReturnClient from "./PurchaseReturnClient";

type PurchaseReturnPageProps = {
  params: Promise<{ purchaseId: string }>;
  searchParams?: Promise<{ shopId?: string }>;
};

function isInventoryModuleDisabledError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { message?: unknown };
  const message = typeof maybe.message === "string" ? maybe.message : "";
  return message.includes("Purchases/Suppliers module is disabled");
}

export default async function PurchaseReturnPage({
  params,
  searchParams,
}: PurchaseReturnPageProps) {
  const [user, { purchaseId }, resolvedSearch] = await Promise.all([
    requireUser(),
    params,
    searchParams,
  ]);
  const canCreatePurchase = hasPermission(user, "create_purchase");

  if (!canCreatePurchase) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">পারচেজ রিটার্ন</h1>
        <p className="mb-2 text-danger font-semibold">অ্যাকসেস সীমাবদ্ধ</p>
        <p className="mb-6 text-muted-foreground">
          এই ফিচার ব্যবহার করতে <code>create_purchase</code> permission লাগবে।
        </p>
        <Link
          href="/dashboard/purchases"
          className="inline-block px-6 py-3 rounded-lg border border-primary/30 bg-primary-soft text-primary font-medium"
        >
          ক্রয় তালিকায় ফিরুন
        </Link>
      </div>
    );
  }

  const shopId = resolvedSearch?.shopId ?? "";
  let context: Awaited<ReturnType<typeof getPurchaseReturnContext>>;
  try {
    context = await getPurchaseReturnContext(purchaseId);
  } catch (error) {
    if (isInventoryModuleDisabledError(error)) {
      return (
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold mb-4 text-foreground">পারচেজ রিটার্ন</h1>
          <p className="mb-2 text-warning font-semibold">মডিউল বন্ধ আছে</p>
          <p className="mb-6 text-muted-foreground">
            এই দোকানে <code>Purchases/Suppliers</code> module চালু না থাকায় supplier return করা যাবে না।
          </p>
          <Link
            href={shopId ? `/dashboard/shops/${shopId}` : "/dashboard/shops"}
            className="inline-block px-6 py-3 rounded-lg border border-primary/30 bg-primary-soft text-primary font-medium"
          >
            দোকানের সেটিংসে যান
          </Link>
        </div>
      );
    }
    throw error;
  }

  const effectiveShopId = shopId || context.purchase.shopId;

  if (context.items.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-[0_12px_26px_rgba(15,23,42,0.08)]">
          <h1 className="text-2xl font-bold text-foreground">পারচেজ রিটার্ন</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            এই ক্রয়ের সব আইটেম আগেই পুরো ফেরত গেছে বা ফেরতযোগ্য কিছু বাকি নেই।
          </p>
          <Link
            href={`/dashboard/purchases/${purchaseId}?shopId=${effectiveShopId}`}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
          >
            ক্রয় বিস্তারিততে ফিরুন
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_16px_36px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Supplier Credit
            </p>
            <h1 className="text-2xl font-bold text-foreground">পারচেজ রিটার্ন তৈরি করুন</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              এই রিটার্ন supplier payable কমাবে। বাকি ছাড়ালে অতিরিক্ত অংশ supplier credit হিসেবে থাকবে।
            </p>
          </div>
          <Link
            href={`/dashboard/purchases/${purchaseId}?shopId=${effectiveShopId}`}
            className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
          >
            ← ক্রয় বিস্তারিত
          </Link>
        </div>
      </div>

      <PurchaseReturnClient
        shopId={effectiveShopId}
        purchaseId={purchaseId}
        supplierName={context.purchase.supplierName}
        dueAmount={context.purchase.dueAmount}
        defaultReturnDate={getDhakaDateString()}
        items={context.items}
      />
    </div>
  );
}
