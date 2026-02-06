// app/dashboard/purchases/page.tsx

import Link from "next/link";
import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import {
  getPurchasesByShopPaginated,
  getPurchaseSummaryByRange,
} from "@/app/actions/purchases";
import ShopSelectorClient from "./ShopSelectorClient";
import { getDhakaDateString } from "@/lib/dhaka-date";

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
  const shops = await getShopsByUser();
  const resolvedSearch = await searchParams;

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
  const formattedTotal = Number.isFinite(totalAmount)
    ? totalAmount.toFixed(2)
    : "0.00";

  const buildHref = (targetPage: number) => {
    const params = new URLSearchParams();
    params.set("shopId", selectedShopId);
    params.set("from", from);
    params.set("to", to);
    if (targetPage > 1) params.set("page", `${targetPage}`);
    return `/dashboard/purchases?${params.toString()}`;
  };

  const prevHref = page > 1 ? buildHref(page - 1) : null;
  const nextHref = page < totalPages ? buildHref(page + 1) : null;

  return (
    <div className="space-y-4 sm:space-y-5 section-gap">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_16px_36px_rgba(15,23,42,0.08)] animate-fade-in">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-success-soft/60 via-card to-card" />
        <div className="pointer-events-none absolute -top-16 right-0 h-40 w-40 rounded-full bg-success/20 blur-3xl" />
        <div className="relative space-y-3 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                স্টক ইন
              </p>
              <h1 className="text-2xl font-bold text-foreground leading-tight tracking-tight sm:text-3xl">
                পণ্য ক্রয় তালিকা
              </h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
                দোকান:
                <span className="truncate font-semibold text-foreground">
                  {selectedShop.name}
                </span>
              </p>
            </div>

            <Link
              href={`/dashboard/purchases/new?shopId=${selectedShopId}`}
              className="hidden sm:inline-flex h-10 items-center gap-2 rounded-full bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold shadow-sm hover:bg-primary/15 hover:border-primary/40 transition-colors"
            >
              ➕ নতুন ক্রয়
            </Link>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:w-auto">
              <ShopSelectorClient
                shops={shops}
                selectedShopId={selectedShopId}
              />
            </div>
            <Link
              href={`/dashboard/purchases/new?shopId=${selectedShopId}`}
              className="sm:hidden inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold shadow-sm hover:bg-primary/15 hover:border-primary/40 transition-colors"
            >
              ➕ নতুন ক্রয় যোগ করুন
            </Link>
          </div>

          <form
            action={buildHref(1)}
            method="get"
            className="grid grid-cols-1 sm:grid-cols-3 gap-2"
          >
            <input type="hidden" name="shopId" value={selectedShopId} />
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-muted-foreground font-semibold">
                শুরু তারিখ
              </label>
              <input
                type="date"
                name="from"
                defaultValue={from}
                className="h-10 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-muted-foreground font-semibold">
                শেষ তারিখ
              </label>
              <input
                type="date"
                name="to"
                defaultValue={to}
                className="h-10 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-muted-foreground font-semibold">
                ফিল্টার
              </label>
              <button
                type="submit"
                className="h-10 rounded-xl bg-primary-soft text-primary border border-primary/30 text-sm font-semibold shadow-sm hover:bg-primary/15 hover:border-primary/40 transition-colors"
              >
                দেখুন
              </button>
            </div>
          </form>

          <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3 text-xs">
            <span className="inline-flex h-7 items-center gap-1 rounded-full bg-card/80 px-3 font-semibold text-foreground border border-border shadow-[0_1px_0_rgba(0,0,0,0.03)]">
              মোট {summary.count ?? 0} টি
            </span>
            <span className="inline-flex h-7 items-center gap-1 rounded-full bg-card/80 px-3 font-semibold text-muted-foreground border border-border">
              ৳ {formattedTotal}
            </span>
            <span className="inline-flex h-7 max-w-[200px] items-center gap-1 rounded-full bg-card/80 px-3 font-semibold text-muted-foreground border border-border truncate">
              সময়: {from === to ? from : `${from} → ${to}`}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_26px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">
              দ্রুত কাজ
            </p>
            <p className="text-sm text-muted-foreground">
              নতুন ক্রয়, বাকি পরিশোধ বা সরবরাহকারী তালিকা এক জায়গায়।
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/dashboard/purchases/new?shopId=${selectedShopId}`}
            className="inline-flex h-10 items-center justify-center rounded-full bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold shadow-sm hover:bg-primary/15 hover:border-primary/40 transition-colors"
          >
            ➕ নতুন ক্রয়
          </Link>
          <Link
            href={`/dashboard/purchases/pay?shopId=${selectedShopId}`}
            className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
          >
            বাকি পরিশোধ
          </Link>
          <Link
            href={`/dashboard/suppliers?shopId=${selectedShopId}`}
            className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
          >
            সরবরাহকারী তালিকা
          </Link>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground space-y-3">
          <p>কোনো ক্রয় পাওয়া যায়নি।</p>
          <Link
            href={`/dashboard/purchases/new?shopId=${selectedShopId}`}
            className="inline-flex h-10 items-center justify-center rounded-full bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold hover:bg-primary/15 hover:border-primary/40 transition-colors"
          >
            প্রথম ক্রয় যোগ করুন
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((purchase) => {
            const topItems = purchase.items.slice(0, 3);
            const extraCount =
              purchase.items.length > 3
                ? purchase.items.length - 3
                : 0;
            return (
              <div
                key={purchase.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_26px_rgba(15,23,42,0.08)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">ক্রয় তারিখ</p>
                    <p className="text-base font-semibold text-foreground">
                      {new Date(purchase.purchaseDate).toLocaleDateString(
                        "bn-BD"
                      )}
                    </p>
                    {purchase.supplierName ? (
                      <p className="text-xs text-muted-foreground">
                        সরবরাহকারী:{" "}
                        <span className="font-semibold text-foreground">
                          {purchase.supplierName}
                        </span>
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-xs text-muted-foreground">মোট ক্রয়</p>
                    <p className="text-base font-bold text-foreground">
                      ৳ {Number(purchase.totalAmount).toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      পরিশোধ: ৳ {Number(purchase.paidAmount).toFixed(2)} · বাকি: ৳{" "}
                      {Number(purchase.dueAmount).toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {topItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 px-3 py-2"
                    >
                      <span className="font-semibold text-foreground">
                        {item.name}
                      </span>
                      <span>
                        {Number(item.quantity).toFixed(2)} × ৳{" "}
                        {Number(item.unitCost).toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {extraCount > 0 ? (
                    <div className="text-[11px] text-muted-foreground">
                      আরও {extraCount}টি আইটেম...
                    </div>
                  ) : null}
                </div>

                {purchase.note ? (
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    নোট: {purchase.note}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2 justify-end">
                  <Link
                    href={`/dashboard/purchases/${purchase.id}?shopId=${selectedShopId}`}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                  >
                    পেমেন্ট ইতিহাস
                  </Link>
                  {Number(purchase.dueAmount) > 0 ? (
                    <Link
                      href={`/dashboard/purchases/pay?shopId=${selectedShopId}&purchaseId=${purchase.id}${
                        purchase.supplierId ? `&supplierId=${purchase.supplierId}` : ""
                      }`}
                      className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary-soft px-4 py-1.5 text-xs font-semibold text-primary hover:bg-primary/15"
                    >
                      বাকি পরিশোধ করুন
                    </Link>
                  ) : null}
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
          Prev
        </Link>
        <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
          Page {page} / {totalPages}
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
          Next
        </Link>
      </div>
    </div>
  );
}
