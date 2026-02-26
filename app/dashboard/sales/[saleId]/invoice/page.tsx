import Link from "next/link";
import { notFound } from "next/navigation";
import { getSaleInvoiceDetails } from "@/app/actions/sales";
import { requireUser } from "@/lib/auth-session";
import { canViewSalesInvoice } from "@/lib/sales-invoice";
import PrintInvoiceButton from "./PrintInvoiceButton";

type PageProps = {
  params: Promise<{ saleId: string }>;
};

function formatMoney(value: string | number) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("bn-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("bn-BD", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const paymentLabel: Record<string, string> = {
  cash: "ক্যাশ",
  bkash: "বিকাশ",
  nagad: "নগদ",
  card: "কার্ড",
  bank_transfer: "ব্যাংক ট্রান্সফার",
  due: "বাকিতে",
};

export default async function SalesInvoicePage({ params }: PageProps) {
  const user = await requireUser();
  if (!canViewSalesInvoice(user)) {
    return (
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          <h1 className="text-2xl font-bold text-foreground">Sales Invoice</h1>
          <p className="mt-2 text-danger font-semibold">অ্যাকসেস সীমাবদ্ধ</p>
          <p className="mt-2 text-sm text-muted-foreground">
            এই পেজ ব্যবহারের জন্য <code>view_sales_invoice</code> permission লাগবে।
          </p>
          <Link
            href="/dashboard/sales"
            className="inline-flex mt-5 h-10 items-center rounded-full border border-primary/30 bg-primary-soft px-4 text-sm font-semibold text-primary hover:bg-primary/15 hover:border-primary/40"
          >
            বিক্রি তালিকায় ফিরুন
          </Link>
        </div>
      </div>
    );
  }

  const { saleId } = await params;

  let data: Awaited<ReturnType<typeof getSaleInvoiceDetails>>;
  try {
    data = await getSaleInvoiceDetails(saleId);
  } catch (error) {
    if (error instanceof Error && /(not found|not issued)/i.test(error.message)) {
      notFound();
    }
    if (error instanceof Error && /(forbidden|unauthorized)/i.test(error.message)) {
      return (
        <div className="mx-auto max-w-2xl p-4 sm:p-6">
          <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <h1 className="text-2xl font-bold text-foreground">Sales Invoice</h1>
            <p className="mt-2 text-danger font-semibold">অ্যাকসেস সীমাবদ্ধ</p>
            <p className="mt-2 text-sm text-muted-foreground">
              এই ইনভয়েস দেখার অনুমতি আপনার নেই।
            </p>
            <Link
              href="/dashboard/sales"
              className="inline-flex mt-5 h-10 items-center rounded-full border border-primary/30 bg-primary-soft px-4 text-sm font-semibold text-primary hover:bg-primary/15 hover:border-primary/40"
            >
              বিক্রি তালিকায় ফিরুন
            </Link>
          </div>
        </div>
      );
    }
    throw error;
  }

  const subTotal = data.items.reduce(
    (sum, item) => sum + Number(item.lineTotal || 0),
    0
  );
  const totalAmountNum = Number(data.totalAmount || 0);
  const statusUpper = (data.status || "").toUpperCase();
  const isVoided = statusUpper === "VOIDED";

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/sales"
            className="inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
          >
            বিক্রিতে ফিরে যান
          </Link>
          {!isVoided ? (
            <Link
              href={`/dashboard/sales/${data.saleId}/return`}
              className="inline-flex h-10 items-center rounded-full border border-warning/30 bg-warning-soft px-4 text-sm font-semibold text-warning hover:bg-warning/15"
            >
              রিটার্ন / এক্সচেঞ্জ
            </Link>
          ) : null}
        </div>
        <PrintInvoiceButton />
      </div>

      <div id="sales-invoice-print-root" data-print-root>
        <article className="print-card overflow-hidden rounded-3xl border border-border bg-card shadow-[0_16px_38px_rgba(15,23,42,0.1)] print:rounded-none print:shadow-none">
          <header className="print-no-break border-b border-border bg-gradient-to-br from-muted/65 via-card to-card px-4 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-muted-foreground">
                  Invoice
                </p>
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
                  SALES INVOICE
                </h1>
                <p className="text-sm text-muted-foreground">
                  ইস্যুর সময়: <span className="font-semibold text-foreground">{formatDateTime(data.invoiceIssuedAt)}</span>
                </p>
              </div>

              <div className="min-w-[250px] rounded-2xl border border-border bg-card px-4 py-3 shadow-sm print:shadow-none">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  Invoice No
                </p>
                <p className="mt-1 font-mono text-lg font-semibold leading-tight text-foreground">
                  {data.invoiceNo}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Sale ID:
                  <span className="ml-1 font-medium break-all text-foreground">
                    {data.saleId}
                  </span>
                </p>
              </div>
            </div>
          </header>

          <section className="print-no-break grid grid-cols-1 gap-3 border-b border-border px-4 py-4 sm:grid-cols-2 sm:px-6">
            <div className="rounded-xl border border-border bg-muted/35 p-3 sm:p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                From
              </p>
              <p className="mt-1.5 text-base font-bold text-foreground">{data.shopName}</p>
              {data.shopAddress ? (
                <p className="mt-1 text-sm text-muted-foreground">{data.shopAddress}</p>
              ) : null}
              {data.shopPhone ? (
                <p className="mt-1 text-sm text-muted-foreground">ফোন: {data.shopPhone}</p>
              ) : null}
            </div>

            <div className="rounded-xl border border-border bg-muted/35 p-3 sm:p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Customer
              </p>
              <p className="mt-1.5 text-base font-bold text-foreground">
                {data.customer?.name || "Walk-in customer"}
              </p>
              {data.customer?.phone ? (
                <p className="mt-1 text-sm text-muted-foreground">ফোন: {data.customer.phone}</p>
              ) : null}
              {data.customer?.address ? (
                <p className="mt-1 text-sm text-muted-foreground">{data.customer.address}</p>
              ) : null}
            </div>
          </section>

          <section className="px-4 py-4 sm:px-6">
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="min-w-full table-fixed text-left text-sm">
                <thead className="bg-muted/55">
                  <tr className="text-muted-foreground">
                    <th className="w-[52%] px-3 py-3 font-semibold">পণ্য</th>
                    <th className="w-[16%] px-3 py-3 text-right font-semibold">Qty</th>
                    <th className="w-[16%] px-3 py-3 text-right font-semibold">Rate</th>
                    <th className="w-[16%] px-3 py-3 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id} className="border-t border-border/70">
                      <td className="px-3 py-3 text-foreground">{item.productName}</td>
                      <td className="px-3 py-3 text-right font-medium tabular-nums text-foreground">
                        {formatMoney(item.quantity)}
                      </td>
                      <td className="px-3 py-3 text-right font-medium tabular-nums text-foreground">
                        ৳ {formatMoney(item.unitPrice)}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-foreground">
                        ৳ {formatMoney(item.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-3 border-t border-border px-4 py-4 sm:grid-cols-2 sm:px-6">
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full border border-border bg-muted/45 px-3 py-1 text-xs font-semibold text-foreground">
                  Payment: {paymentLabel[data.paymentMethod] || data.paymentMethod}
                </span>
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                    isVoided
                      ? "border-danger/30 bg-danger-soft text-danger"
                      : "border-success/30 bg-success-soft text-success"
                  }`}
                >
                  {isVoided ? "VOIDED" : "COMPLETED"}
                </span>
              </div>
              <p className="text-muted-foreground">
                Sale সময়: <span className="font-medium text-foreground">{formatDateTime(data.saleDate)}</span>
              </p>
              {data.note ? (
                <p className="text-muted-foreground">
                  নোট: <span className="text-foreground">{data.note}</span>
                </p>
              ) : null}
              {isVoided ? (
                <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
                  বাতিলকৃত বিক্রি। কারণ: {data.voidReason || "উল্লেখ নেই"}
                </p>
              ) : null}
            </div>

            <div className="print-no-break rounded-2xl border border-border bg-muted/35 p-3 sm:p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">সাব-টোটাল</span>
                  <span className="font-medium tabular-nums text-foreground">৳ {formatMoney(subTotal)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">রাউন্ডিং</span>
                  <span className="font-medium tabular-nums text-foreground">
                    ৳ {formatMoney(totalAmountNum - subTotal)}
                  </span>
                </div>
                <div className="border-t border-border pt-2">
                  <div className="flex items-center justify-between text-base font-bold sm:text-lg">
                    <span className="text-foreground">সর্বমোট</span>
                    <span className="tabular-nums text-foreground">৳ {formatMoney(totalAmountNum)}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <footer className="print-no-break border-t border-border bg-muted/30 px-4 py-3 sm:px-6">
            <p className="text-center text-xs text-muted-foreground sm:text-sm">
              আপনার কেনাকাটার জন্য ধন্যবাদ। এই invoice কপিটি POS সিস্টেম থেকে generated।
            </p>
          </footer>
        </article>
      </div>
    </div>
  );
}
