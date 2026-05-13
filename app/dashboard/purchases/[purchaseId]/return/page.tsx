import Link from "next/link";
import { getDhakaDateString } from "@/lib/dhaka-date";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import { getPurchaseReturnContext } from "@/app/actions/purchases";
import PurchaseReturnClient from "./PurchaseReturnClient";
import { Breadcrumb } from "@/components/ui/breadcrumb";

type PurchaseReturnPageProps = {
  params: Promise<{ purchaseId: string }>;
  searchParams?: Promise<{ shopId?: string }>;
};

function isInventoryModuleDisabledError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const msg = (error as { message?: unknown }).message;
  return typeof msg === "string" && msg.includes("Purchases/Suppliers module is disabled");
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
        <h1 className="text-2xl font-bold mb-4 text-foreground">সাপ্লায়ার রিটার্ন</h1>
        <p className="mb-2 text-danger font-semibold">অ্যাকসেস সীমাবদ্ধ</p>
        <p className="mb-6 text-muted-foreground">
          এই ফিচার ব্যবহার করতে <code>create_purchase</code> permission লাগবে।
        </p>
        <Link href="/dashboard/purchases" className="inline-block px-6 py-3 rounded-lg border border-primary/30 bg-primary-soft text-primary font-medium hover:bg-primary/15 transition-colors">
          ক্রয় তালিকায় ফিরুন
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
          <h1 className="text-2xl font-bold mb-4 text-foreground">সাপ্লায়ার রিটার্ন</h1>
          <p className="mb-2 text-warning font-semibold">মডিউল বন্ধ আছে</p>
          <p className="mb-6 text-muted-foreground">
            এই দোকানে <code>Purchases/Suppliers</code> module চালু না থাকায় supplier return করা যাবে না।
          </p>
          <Link href={shopId ? `/dashboard/shops/${shopId}` : "/dashboard/shops"} className="inline-block px-6 py-3 rounded-lg border border-primary/30 bg-primary-soft text-primary font-medium hover:bg-primary/15 transition-colors">
            দোকানের সেটিংসে যান
          </Link>
        </div>
      );
    }
    throw error;
  }

  const effectiveShopId = shopId || context.purchase.shopId;
  const supplierInitial = context.purchase.supplierName?.trim().charAt(0).toUpperCase() ?? "?";

  if (context.items.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success text-xl font-bold">
            ✓
          </div>
          <h1 className="text-lg font-bold text-foreground">রিটার্নযোগ্য কিছু নেই</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            এই ক্রয়ের সব আইটেম আগেই পুরো ফেরত গেছে।
          </p>
          <Link
            href={`/dashboard/purchases/${purchaseId}?shopId=${effectiveShopId}`}
            className="mt-4 inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
          >
            ← ক্রয় বিস্তারিত
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">

      <Breadcrumb
        items={[
          { label: "হোম", href: "/dashboard" },
          { label: "ক্রয়", href: `/dashboard/purchases?shopId=${effectiveShopId}` },
          { label: "সাপ্লায়ার রিটার্ন" },
        ]}
        className="mb-2"
      />

      {/* ── Hero card ── */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-warning-soft/50 via-card to-card" />
        <div className="pointer-events-none absolute -top-12 right-0 h-32 w-32 rounded-full bg-warning/15 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning border border-warning/20 text-base font-bold shadow-sm">
              {supplierInitial}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                সাপ্লায়ার রিটার্ন
              </p>
              <h1 className="text-xl font-bold leading-tight text-foreground sm:text-2xl">
                {context.purchase.supplierName || "সরবরাহকারী নেই"}
              </h1>
              <p className="text-xs text-muted-foreground">
                বর্তমান বাকি:{" "}
                <span className="font-semibold text-warning">
                  ৳ {Number(context.purchase.dueAmount || 0).toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </p>
            </div>
          </div>
          <Link
            href={`/dashboard/purchases/${purchaseId}?shopId=${effectiveShopId}`}
            className="inline-flex h-9 shrink-0 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-sm hover:bg-muted transition-colors"
          >
            ← ফিরুন
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
