// app/dashboard/purchases/[purchaseId]/page.tsx

import Link from "next/link";
import { getPurchaseWithPayments } from "@/app/actions/purchases";

type PurchaseDetailPageProps = {
  params: Promise<{ purchaseId: string }>;
  searchParams?: Promise<{ shopId?: string; page?: string }>;
};

export default async function PurchaseDetailPage({
  params,
  searchParams,
}: PurchaseDetailPageProps) {
  const { purchaseId } = await params;
  const resolvedSearch = await searchParams;
  const shopId = resolvedSearch?.shopId ?? "";
  const page = Number(resolvedSearch?.page ?? 1);
  const purchase = await getPurchaseWithPayments(purchaseId, {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: 10,
  });
  const dueAmount = Number(purchase.dueAmount ?? 0);

  const totalPages = purchase.paymentMeta?.totalPages ?? 1;
  const currentPage = purchase.paymentMeta?.page ?? 1;
  const buildHref = (targetPage: number) =>
    `/dashboard/purchases/${purchaseId}?shopId=${shopId}&page=${targetPage}`;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_16px_36px_rgba(15,23,42,0.08)]">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          ক্রয় বিস্তারিত
        </p>
        <h1 className="text-2xl font-bold text-foreground leading-tight tracking-tight sm:text-3xl">
          পেমেন্ট ইতিহাস
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          সরবরাহকারী:{" "}
          <span className="font-semibold text-foreground">
            {purchase.supplierName || "N/A"}
          </span>
        </p>
        <Link
          href={`/dashboard/purchases?shopId=${shopId}`}
          className="inline-flex mt-3 items-center gap-2 text-xs font-semibold text-primary hover:text-primary-hover"
        >
          ← ক্রয় তালিকায় ফিরুন
        </Link>
        {dueAmount > 0 ? (
          <Link
            href={`/dashboard/purchases/pay?shopId=${shopId}&purchaseId=${purchaseId}${
              purchase.supplierId ? `&supplierId=${purchase.supplierId}` : ""
            }`}
            className="inline-flex mt-2 items-center gap-2 rounded-full bg-primary-soft text-primary border border-primary/30 px-4 py-2 text-xs font-semibold hover:bg-primary/15 hover:border-primary/40 transition-colors"
          >
            বাকি পরিশোধ করুন
          </Link>
        ) : null}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">ক্রয় তারিখ</p>
            <p className="text-base font-semibold text-foreground">
              {new Date(purchase.purchaseDate).toLocaleDateString("bn-BD")}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">মোট</p>
            <p className="text-base font-bold text-foreground">
              ৳ {Number(purchase.totalAmount).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">
              পরিশোধ: ৳ {Number(purchase.paidAmount).toFixed(2)} · বাকি: ৳{" "}
              {Number(purchase.dueAmount).toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <h2 className="text-base font-semibold text-foreground">আইটেম তালিকা</h2>
        <div className="mt-3 space-y-2 text-xs">
          {purchase.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2"
            >
              <span className="font-semibold text-foreground">{item.name}</span>
              <span className="text-muted-foreground">
                {Number(item.quantity).toFixed(2)} × ৳{" "}
                {Number(item.unitCost).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <h2 className="text-base font-semibold text-foreground">পেমেন্ট ইতিহাস</h2>
        {purchase.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-3">কোনো পেমেন্ট নেই।</p>
        ) : (
          <div className="mt-3 space-y-2 text-xs">
            {purchase.payments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2"
              >
                <div>
                  <p className="font-semibold text-foreground">৳ {Number(p.amount).toFixed(2)}</p>
                  <p className="text-muted-foreground">{p.note || "নোট নেই"}</p>
                </div>
                <div className="text-right text-muted-foreground">
                  <p>{new Date(p.paidAt).toLocaleDateString("bn-BD")}</p>
                  <p className="text-[11px]">{p.method}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {totalPages > 1 ? (
          <div className="mt-3 flex items-center justify-between text-xs">
            <Link
              href={buildHref(Math.max(1, currentPage - 1))}
              aria-disabled={currentPage <= 1}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 font-semibold ${
                currentPage <= 1
                  ? "border-border/50 text-muted-foreground pointer-events-none"
                  : "border-border text-foreground hover:bg-muted"
              }`}
            >
              Prev
            </Link>
            <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
              Page {currentPage} / {totalPages}
            </span>
            <Link
              href={buildHref(Math.min(totalPages, currentPage + 1))}
              aria-disabled={currentPage >= totalPages}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 font-semibold ${
                currentPage >= totalPages
                  ? "border-border/50 text-muted-foreground pointer-events-none"
                  : "border-border text-foreground hover:bg-muted"
              }`}
            >
              Next
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
