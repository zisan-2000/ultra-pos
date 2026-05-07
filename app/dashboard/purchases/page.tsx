// app/dashboard/purchases/page.tsx

import Link from "next/link";
import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import {
  getPurchasesByShopPaginated,
  getPurchaseSummaryByRange,
} from "@/app/actions/purchases";
import ShopSelectorClient from "./ShopSelectorClient";
import DashboardManualRefresh from "@/components/dashboard-manual-refresh";
import PurchaseDateFilterClient from "./PurchaseDateFilterClient";
import { getDhakaDateString } from "@/lib/dhaka-date";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import { resolveInventoryModuleEnabled } from "@/lib/accounting/cogs";

type PurchasePageProps = {
  searchParams?: Promise<{
    shopId?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
};

const PAGE_SIZE = 20;

function parsePositiveInt(value?: string) {
  if (!value) return null;
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) && num > 0 ? num : null;
}

export default async function PurchasesPage({ searchParams }: PurchasePageProps) {
  const [user, shops, resolvedSearch] = await Promise.all([
    requireUser(),
    getShopsByUser(),
    searchParams,
  ]);
  const canViewPurchases = hasPermission(user, "view_purchases");
  const canCreatePurchase = hasPermission(user, "create_purchase");
  const canCreatePurchasePayment = hasPermission(user, "create_purchase_payment");

  if (!canViewPurchases) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">পণ্য ক্রয়</h1>
        <p className="mb-2 text-danger font-semibold">অ্যাকসেস সীমাবদ্ধ</p>
        <p className="mb-6 text-muted-foreground">
          এই পেজ ব্যবহারের জন্য <code>view_purchases</code> permission লাগবে।
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors"
        >
          ড্যাশবোর্ডে ফিরুন
        </Link>
      </div>
    );
  }

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">
          পণ্য ক্রয় (স্টক ইন)
        </h1>
        <p className="mb-6 text-muted-foreground">এখনও কোনো দোকান নেই।</p>
        <Link
          href="/dashboard/shops/new"
          className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors"
        >
          প্রথম দোকান তৈরি করুন
        </Link>
      </div>
    );
  }

  const cookieStore = await cookies();
  const cookieShopId = cookieStore.get("activeShopId")?.value;

  const cookieSelectedShopId =
    cookieShopId && shops.some((s) => s.id === cookieShopId)
      ? cookieShopId
      : null;

  const selectedShopId =
    resolvedSearch?.shopId &&
    shops.some((s) => s.id === resolvedSearch.shopId)
      ? resolvedSearch.shopId
      : cookieSelectedShopId ?? shops[0].id;

  const selectedShop = shops.find((s) => s.id === selectedShopId)!;
  const hasInventoryModule = resolveInventoryModuleEnabled(selectedShop);

  if (!hasInventoryModule) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">পণ্য ক্রয়</h1>
        <p className="mb-2 text-warning font-semibold">মডিউল বন্ধ আছে</p>
        <p className="mb-6 text-muted-foreground">
          এই দোকানে <code>Purchases/Suppliers</code> module এখনো চালু করা হয়নি।
        </p>
        <Link
          href={`/dashboard/shops/${selectedShopId}`}
          className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors"
        >
          দোকানের সেটিংসে যান
        </Link>
      </div>
    );
  }

  const rawFrom = resolvedSearch?.from;
  const rawTo = resolvedSearch?.to;
  const today = getDhakaDateString();
  const from = rawFrom ?? rawTo ?? today;
  const to = rawTo ?? from;

  const page = parsePositiveInt(resolvedSearch?.page) ?? 1;

  const [{ items, totalPages }, summary] = await Promise.all([
    getPurchasesByShopPaginated({
      shopId: selectedShopId,
      from,
      to,
      page,
      pageSize: PAGE_SIZE,
    }),
    getPurchaseSummaryByRange(selectedShopId, from, to),
  ]);

  const totalAmount = Number(summary.totalAmount ?? 0);
  const purchaseReturnTotal = Number(summary.purchaseReturnTotal ?? 0);
  const paidTotal = Number(summary.paidTotal ?? 0);
  const formattedTotal = Number.isFinite(totalAmount)
    ? totalAmount.toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "০.০০";

  const buildHref = (targetPage: number) => {
    const params = new URLSearchParams();
    params.set("shopId", selectedShopId);
    params.set("from", from);
    params.set("to", to);
    if (targetPage > 1) params.set("page", String(targetPage));
    return `/dashboard/purchases?${params.toString()}`;
  };

  const prevHref = page > 1 ? buildHref(page - 1) : null;
  const nextHref = page < totalPages ? buildHref(page + 1) : null;

  return (
    <div className="space-y-4 sm:space-y-5 section-gap">

      {/* ── Hero card ── */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_40px_rgba(15,23,42,0.10)] animate-fade-in">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-soft/50 via-card to-card" />
        <div className="pointer-events-none absolute -top-20 right-0 h-52 w-52 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-10 h-32 w-32 rounded-full bg-success/10 blur-2xl" />
        <div className="relative p-4 space-y-4">

          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                পণ্য ক্রয়
              </p>
              <p className="text-4xl font-extrabold tabular-nums leading-none text-foreground">
                {(summary.count ?? 0).toLocaleString("bn-BD")}
              </p>
            </div>
            {canCreatePurchase ? (
              <Link
                href={`/dashboard/purchases/new?shopId=${selectedShopId}`}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold shadow-sm hover:bg-primary/15 hover:border-primary/40 transition-colors"
              >
                + নতুন ক্রয়
              </Link>
            ) : null}
          </div>

          <ShopSelectorClient shops={shops} selectedShopId={selectedShopId} />

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-border bg-card/60 px-3 py-2.5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">নেট ক্রয়</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-foreground">৳ {formattedTotal}</p>
            </div>
            <div className="rounded-xl border border-success/30 bg-success-soft/60 px-3 py-2.5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-success/80">পরিশোধ</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-success">
                ৳ {paidTotal.toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-xl border border-warning/30 bg-warning-soft/60 px-3 py-2.5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-warning/80">রিটার্ন</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-warning">
                ৳ {purchaseReturnTotal.toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>

        </div>
      </div>

      <PurchaseDateFilterClient shopId={selectedShopId} from={from} to={to} />

      {items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground space-y-3">
          <p>কোনো ক্রয় পাওয়া যায়নি।</p>
          {canCreatePurchase ? (
            <Link
              href={`/dashboard/purchases/new?shopId=${selectedShopId}`}
              className="inline-flex h-10 items-center justify-center rounded-full bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold hover:bg-primary/15 hover:border-primary/40 transition-colors"
            >
              প্রথম ক্রয় যোগ করুন
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((purchase) => {
            const topItems = purchase.items.slice(0, 3);
            const extraCount = purchase.items.length > 3 ? purchase.items.length - 3 : 0;
            const dueAmt = Number(purchase.dueAmount);
            const paidAmt = Number(purchase.paidAmount);
            const totalAmt = Number(purchase.totalAmount);
            const initials = purchase.supplierName
              ? purchase.supplierName.trim().charAt(0).toUpperCase()
              : "?";
            const isFullyPaid = dueAmt <= 0;
            return (
              <div
                key={purchase.id}
                className={`rounded-2xl border bg-card overflow-hidden shadow-sm transition-shadow hover:shadow-md ${
                  dueAmt > 0 ? "border-warning/30" : "border-border"
                }`}
              >
                <div className="p-4 space-y-3">

                  {/* ── Top row: avatar + supplier/date + amount ── */}
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      purchase.supplierName
                        ? "bg-primary-soft text-primary border border-primary/20"
                        : "bg-muted text-muted-foreground border border-border"
                    }`}>
                      {initials}
                    </div>

                    <div className="flex flex-1 min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground leading-tight truncate">
                          {purchase.supplierName || "সরবরাহকারী নেই"}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {new Date(purchase.purchaseDate).toLocaleDateString("bn-BD")}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-base font-extrabold tabular-nums text-foreground leading-tight">
                          ৳ {totalAmt.toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-[11px] text-muted-foreground">মোট ক্রয়</p>
                      </div>
                    </div>
                  </div>

                  {/* ── Status chips ── */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-success/30 bg-success-soft px-2.5 py-0.5 text-[11px] font-semibold text-success">
                      পরিশোধ ৳ {paidAmt.toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {dueAmt > 0 ? (
                      <span className="inline-flex items-center rounded-full border border-warning/30 bg-warning-soft px-2.5 py-0.5 text-[11px] font-semibold text-warning">
                        বাকি ৳ {dueAmt.toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-success/20 bg-success-soft/50 px-2.5 py-0.5 text-[11px] font-semibold text-success/70">
                        সম্পূর্ণ পরিশোধিত ✓
                      </span>
                    )}
                  </div>

                  {/* ── Items ── */}
                  {topItems.length > 0 ? (
                    <div className="space-y-1.5">
                      {topItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-xs"
                        >
                          <span className="font-semibold text-foreground truncate mr-2">{item.name}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {Number(item.quantity).toLocaleString("bn-BD", { maximumFractionDigits: 2 })} × ৳{" "}
                            {Number(item.unitCost).toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                      {extraCount > 0 ? (
                        <p className="pl-1 text-[11px] text-muted-foreground">
                          + আরও {extraCount.toLocaleString("bn-BD")}টি পণ্য
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {/* ── Note ── */}
                  {purchase.note ? (
                    <div className="rounded-xl border border-border/50 bg-muted/25 px-3 py-2 text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground/80">নোট: </span>{purchase.note}
                    </div>
                  ) : null}

                  {/* ── Actions ── */}
                  <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-3">
                    <Link
                      href={`/dashboard/purchases/${purchase.id}?shopId=${selectedShopId}`}
                      className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors"
                    >
                      পেমেন্ট ইতিহাস →
                    </Link>
                    {dueAmt > 0 && canCreatePurchasePayment ? (
                      <Link
                        href={`/dashboard/purchases/pay?shopId=${selectedShopId}&purchaseId=${purchase.id}${
                          purchase.supplierId ? `&supplierId=${purchase.supplierId}` : ""
                        }`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-warning/30 bg-warning-soft px-3 text-xs font-semibold text-warning hover:bg-warning/15 transition-colors"
                      >
                        বাকি পরিশোধ করুন
                      </Link>
                    ) : null}
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2">
        <Link
          href={prevHref ?? "#"}
          aria-disabled={!prevHref}
          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${
            prevHref
              ? "border-border text-foreground hover:bg-muted"
              : "border-border/50 text-muted-foreground pointer-events-none"
          }`}
        >
          ◀ আগের
        </Link>
        <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
          পৃষ্ঠা {page.toLocaleString("bn-BD")} / {totalPages.toLocaleString("bn-BD")}
        </span>
        <Link
          href={nextHref ?? "#"}
          aria-disabled={!nextHref}
          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${
            nextHref
              ? "border-border text-foreground hover:bg-muted"
              : "border-border/50 text-muted-foreground pointer-events-none"
          }`}
        >
          পরের ▶
        </Link>
      </div>
    </div>
  );
}
