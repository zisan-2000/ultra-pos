// app/dashboard/purchases/[purchaseId]/page.tsx

import Link from "next/link";
import { getPurchaseWithPayments } from "@/app/actions/purchases";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";

type PurchaseDetailPageProps = {
  params: Promise<{ purchaseId: string }>;
  searchParams?: Promise<{ shopId?: string; page?: string }>;
};

function isInventoryModuleDisabledError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const msg = (error as { message?: unknown }).message;
  return typeof msg === "string" && msg.includes("Purchases/Suppliers module is disabled");
}

const METHOD_ICONS: Record<string, string> = {
  cash: "💵",
  bkash: "📱",
  bank: "🏦",
};

function fmt(n: number) {
  return n.toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function PurchaseDetailPage({
  params,
  searchParams,
}: PurchaseDetailPageProps) {
  const [user, { purchaseId }, resolvedSearch] = await Promise.all([
    requireUser(),
    params,
    searchParams,
  ]);
  const canViewPurchases = hasPermission(user, "view_purchases");
  const canCreatePurchasePayment = hasPermission(user, "create_purchase_payment");
  const canCreatePurchase = hasPermission(user, "create_purchase");

  if (!canViewPurchases) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">ক্রয় বিস্তারিত</h1>
        <p className="mb-2 text-danger font-semibold">অ্যাকসেস সীমাবদ্ধ</p>
        <p className="mb-6 text-muted-foreground">
          এই পেজ ব্যবহারের জন্য <code>view_purchases</code> permission লাগবে।
        </p>
        <Link href="/dashboard/purchases" className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors">
          ক্রয় তালিকায় ফিরুন
        </Link>
      </div>
    );
  }

  const shopId = resolvedSearch?.shopId ?? "";
  const page = Number(resolvedSearch?.page ?? 1);

  let purchase: Awaited<ReturnType<typeof getPurchaseWithPayments>>;
  try {
    purchase = await getPurchaseWithPayments(purchaseId, {
      page: Number.isFinite(page) && page > 0 ? page : 1,
      pageSize: 10,
    });
  } catch (error) {
    if (isInventoryModuleDisabledError(error)) {
      return (
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold mb-4 text-foreground">ক্রয় বিস্তারিত</h1>
          <p className="mb-2 text-warning font-semibold">মডিউল বন্ধ আছে</p>
          <p className="mb-6 text-muted-foreground">
            এই দোকানে <code>Purchases/Suppliers</code> module চালু না থাকায় ক্রয় history দেখা যাবে না।
          </p>
          <Link href={shopId ? `/dashboard/shops/${shopId}` : "/dashboard/shops"} className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors">
            দোকানের সেটিংসে যান
          </Link>
        </div>
      );
    }
    throw error;
  }

  const dueAmount = Number(purchase.dueAmount ?? 0);
  const paidAmount = Number(purchase.paidAmount ?? 0);
  const totalAmount = Number(purchase.totalAmount ?? 0);
  const subtotalAmount = Number(purchase.subtotalAmount ?? totalAmount);
  const landedCostTotal = Number(purchase.landedCostTotal ?? 0);
  const transportCost = Number(purchase.transportCost ?? 0);
  const unloadingCost = Number(purchase.unloadingCost ?? 0);
  const carryingCost = Number(purchase.carryingCost ?? 0);
  const otherLandedCost = Number(purchase.otherLandedCost ?? 0);
  const supplierInitial = purchase.supplierName?.trim().charAt(0).toUpperCase() ?? "?";
  const isFullyPaid = dueAmount <= 0;

  const totalPages = purchase.paymentMeta?.totalPages ?? 1;
  const currentPage = purchase.paymentMeta?.page ?? 1;
  const buildHref = (targetPage: number) =>
    `/dashboard/purchases/${purchaseId}?shopId=${shopId}&page=${targetPage}`;

  return (
    <div className="space-y-4 sm:space-y-5">

      {/* ── Hero card ── */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-primary-soft/40 via-card to-card" />
        <div className="pointer-events-none absolute -top-12 right-0 h-32 w-32 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative p-4 space-y-3">

          {/* Top row: info + back */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold shadow-sm ${
                purchase.supplierName
                  ? "bg-primary-soft text-primary border border-primary/20"
                  : "bg-muted text-muted-foreground border border-border"
              }`}>
                {supplierInitial}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  ক্রয় বিস্তারিত
                </p>
                <h1 className="text-xl font-bold leading-tight text-foreground sm:text-2xl">
                  {purchase.supplierName || "সরবরাহকারী নেই"}
                </h1>
                <p className="text-xs text-muted-foreground">
                  {new Date(purchase.purchaseDate).toLocaleDateString("bn-BD", {
                    year: "numeric", month: "long", day: "numeric",
                  })}
                </p>
              </div>
            </div>
            <Link
              href={`/dashboard/purchases?shopId=${shopId}`}
              className="inline-flex h-9 shrink-0 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-sm hover:bg-muted transition-colors"
            >
              ← ফিরুন
            </Link>
          </div>

          {/* Financial chips */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-card/60 px-3 py-2 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">সাবটোটাল</p>
              <p className="mt-0.5 text-sm font-extrabold tabular-nums text-foreground">৳ {fmt(subtotalAmount)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card/60 px-3 py-2 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary/80">ল্যান্ডেড কস্ট</p>
              <p className="mt-0.5 text-sm font-extrabold tabular-nums text-primary">৳ {fmt(landedCostTotal)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card/60 px-3 py-2 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">গ্র্যান্ড টোটাল</p>
              <p className="mt-0.5 text-sm font-extrabold tabular-nums text-foreground">৳ {fmt(totalAmount)}</p>
            </div>
            <div className="rounded-xl border border-success/30 bg-success-soft/60 px-3 py-2 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-success/80">পরিশোধ</p>
              <p className="mt-0.5 text-sm font-extrabold tabular-nums text-success">৳ {fmt(paidAmount)}</p>
            </div>
            <div className={`rounded-xl border px-3 py-2 text-center ${isFullyPaid ? "border-success/20 bg-success-soft/40" : "border-warning/30 bg-warning-soft/60"}`}>
              <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${isFullyPaid ? "text-success/70" : "text-warning/80"}`}>বাকি</p>
              <p className={`mt-0.5 text-sm font-extrabold tabular-nums ${isFullyPaid ? "text-success" : "text-warning"}`}>
                {isFullyPaid ? "✓ শূন্য" : `৳ ${fmt(dueAmount)}`}
              </p>
            </div>
          </div>

          {landedCostTotal > 0 ? (
            <div className="rounded-xl border border-primary/20 bg-primary-soft/20 px-4 py-3 text-xs text-foreground">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span>Transport: ৳ {fmt(transportCost)}</span>
                <span>Unloading: ৳ {fmt(unloadingCost)}</span>
                <span>Carrying: ৳ {fmt(carryingCost)}</span>
                <span>Other: ৳ {fmt(otherLandedCost)}</span>
              </div>
            </div>
          ) : null}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 border-t border-border/40 pt-3">
            {dueAmount > 0 && canCreatePurchasePayment ? (
              <Link
                href={`/dashboard/purchases/pay?shopId=${shopId}&purchaseId=${purchaseId}${purchase.supplierId ? `&supplierId=${purchase.supplierId}` : ""}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-warning-soft text-warning border border-warning/30 px-4 text-sm font-semibold hover:bg-warning/15 transition-colors"
              >
                বাকি পরিশোধ করুন
              </Link>
            ) : null}
            {purchase.supplierId && canCreatePurchase ? (
              <Link
                href={`/dashboard/purchases/${purchaseId}/return?shopId=${shopId}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
              >
                সাপ্লায়ার রিটার্ন
              </Link>
            ) : null}
          </div>

        </div>
      </div>

      {/* ── Items ── */}
      {purchase.items.length > 0 ? (
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              পণ্য তালিকা
            </p>
            <span className="text-[11px] font-semibold text-muted-foreground">
              {purchase.items.length.toLocaleString("bn-BD")}টি পণ্য
            </span>
          </div>
          <div className="divide-y divide-border/40">
            {purchase.items.map((item) => {
              const lineTotal = Number(item.quantity) * Number(item.unitCost);
              const landedAllocated = Number(item.landedCostAllocated ?? 0);
              const effectiveLineTotal = Number(item.effectiveLineTotal ?? lineTotal);
              const effectiveUnitCost = Number(item.effectiveUnitCost ?? item.unitCost);
              return (
                <div key={item.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.name}</p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {Number(item.quantity).toLocaleString("bn-BD", { maximumFractionDigits: 2 })} ×
                      ৳ {fmt(Number(item.unitCost))}
                    </p>
                    {landedAllocated > 0 ? (
                      <p className="text-[11px] text-primary tabular-nums">
                        landed ৳ {fmt(landedAllocated)} → effective unit ৳ {fmt(effectiveUnitCost)}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums text-foreground">
                      ৳ {fmt(effectiveLineTotal)}
                    </p>
                    {landedAllocated > 0 ? (
                      <p className="text-[11px] text-muted-foreground">base ৳ {fmt(lineTotal)}</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-t border-border/60 bg-muted/30 px-4 py-3">
            <p className="text-xs font-semibold text-muted-foreground">মোট</p>
            <p className="text-sm font-extrabold tabular-nums text-foreground">৳ {fmt(totalAmount)}</p>
          </div>
        </div>
      ) : null}

      {/* ── Payment history ── */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            পেমেন্ট ইতিহাস
          </p>
          <span className="text-[11px] font-semibold text-muted-foreground">
            {purchase.payments.length.toLocaleString("bn-BD")}টি পেমেন্ট
          </span>
        </div>

        {purchase.payments.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            এখনও কোনো পেমেন্ট রেকর্ড হয়নি।
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {purchase.payments.map((p) => {
              const icon = METHOD_ICONS[p.method] ?? "💳";
              return (
                <div key={p.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 text-base">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold tabular-nums text-foreground">
                      ৳ {fmt(Number(p.amount))}
                    </p>
                    {p.note ? (
                      <p className="text-[11px] text-muted-foreground truncate">{p.note}</p>
                    ) : null}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold text-foreground">
                      {new Date(p.paidAt).toLocaleDateString("bn-BD")}
                    </p>
                    <p className="text-[11px] text-muted-foreground capitalize">{p.method}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-border/60 bg-muted/30 px-4 py-3">
            <Link
              href={buildHref(Math.max(1, currentPage - 1))}
              aria-disabled={currentPage <= 1}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${
                currentPage <= 1
                  ? "border-border/50 text-muted-foreground pointer-events-none"
                  : "border-border text-foreground hover:bg-muted"
              }`}
            >
              ◀ আগের
            </Link>
            <span className="text-xs font-semibold text-muted-foreground">
              পৃষ্ঠা {currentPage.toLocaleString("bn-BD")} / {totalPages.toLocaleString("bn-BD")}
            </span>
            <Link
              href={buildHref(Math.min(totalPages, currentPage + 1))}
              aria-disabled={currentPage >= totalPages}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${
                currentPage >= totalPages
                  ? "border-border/50 text-muted-foreground pointer-events-none"
                  : "border-border text-foreground hover:bg-muted"
              }`}
            >
              পরের ▶
            </Link>
          </div>
        ) : null}
      </div>

      {/* ── Return history ── */}
      {purchase.returns.length > 0 ? (
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              সাপ্লায়ার রিটার্ন
            </p>
            <span className="text-[11px] font-semibold text-muted-foreground">
              {purchase.returns.length.toLocaleString("bn-BD")}টি রিটার্ন
            </span>
          </div>
          <div className="divide-y divide-border/40">
            {purchase.returns.map((ret) => (
              <div key={ret.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      ৳ {fmt(Number(ret.totalAmount))}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(ret.returnDate).toLocaleDateString("bn-BD")}
                    </p>
                    {ret.note ? (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{ret.note}</p>
                    ) : null}
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <span className="inline-flex items-center rounded-full border border-warning/30 bg-warning-soft px-2.5 py-0.5 text-[11px] font-semibold text-warning">
                      ক্রেডিট ৳ {fmt(Number(ret.supplierCredit))}
                    </span>
                    <p className="text-[10px] text-muted-foreground">
                      #{ret.id.slice(0, 8)}
                    </p>
                  </div>
                </div>
                {ret.items.length > 0 ? (
                  <div className="space-y-1.5">
                    {ret.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-xs">
                        <div>
                          <p className="font-semibold text-foreground">
                            {item.name}{item.variantLabel ? ` (${item.variantLabel})` : ""}
                          </p>
                          <p className="text-muted-foreground tabular-nums">
                            {Number(item.quantity).toLocaleString("bn-BD", { maximumFractionDigits: 2 })} × ৳ {fmt(Number(item.unitCost))}
                          </p>
                        </div>
                        <p className="font-bold tabular-nums text-foreground">
                          ৳ {fmt(Number(item.lineTotal))}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

    </div>
  );
}
