import Link from "next/link";
import { notFound } from "next/navigation";
import { getSaleInvoiceDetails } from "@/app/actions/sales";
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
  const { saleId } = await params;

  let data: Awaited<ReturnType<typeof getSaleInvoiceDetails>>;
  try {
    data = await getSaleInvoiceDetails(saleId);
  } catch (error) {
    if (
      error instanceof Error &&
      /(not found|not issued|forbidden|unauthorized)/i.test(error.message)
    ) {
      notFound();
    }
    throw error;
  }

  const subTotal = data.items.reduce(
    (sum, item) => sum + Number(item.lineTotal || 0),
    0
  );
  const statusUpper = (data.status || "").toUpperCase();
  const isVoided = statusUpper === "VOIDED";

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href="/dashboard/sales"
          className="inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
        >
          বিক্রিতে ফিরে যান
        </Link>
        <PrintInvoiceButton />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6 print:shadow-none print:border-black/30">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-foreground">Sales Invoice</h1>
            <p className="text-sm text-muted-foreground">
              ইনভয়েস নং: <span className="font-semibold">{data.invoiceNo}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              ইস্যু: {formatDateTime(data.invoiceIssuedAt)}
            </p>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">{data.shopName}</p>
            {data.shopAddress ? <p>{data.shopAddress}</p> : null}
            {data.shopPhone ? <p>ফোন: {data.shopPhone}</p> : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 border-b border-border py-4 text-sm sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-muted-foreground">Sale ID</p>
            <p className="font-medium text-foreground">{data.saleId}</p>
            <p className="text-muted-foreground">Sale সময়</p>
            <p className="font-medium text-foreground">{formatDateTime(data.saleDate)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Payment</p>
            <p className="font-medium text-foreground">
              {paymentLabel[data.paymentMethod] || data.paymentMethod}
            </p>
            <p className="text-muted-foreground">Customer</p>
            <p className="font-medium text-foreground">
              {data.customer?.name || "Walk-in customer"}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto py-4">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-2 py-2 font-semibold">পণ্য</th>
                <th className="px-2 py-2 font-semibold text-right">Qty</th>
                <th className="px-2 py-2 font-semibold text-right">Rate</th>
                <th className="px-2 py-2 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id} className="border-b border-border/70">
                  <td className="px-2 py-2 text-foreground">{item.productName}</td>
                  <td className="px-2 py-2 text-right text-foreground">
                    {formatMoney(item.quantity)}
                  </td>
                  <td className="px-2 py-2 text-right text-foreground">
                    {formatMoney(item.unitPrice)}
                  </td>
                  <td className="px-2 py-2 text-right font-medium text-foreground">
                    {formatMoney(item.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">সাব-টোটাল</span>
            <span className="font-medium text-foreground">৳ {formatMoney(subTotal)}</span>
          </div>
          <div className="flex items-center justify-between text-base font-semibold">
            <span className="text-foreground">সর্বমোট</span>
            <span className="text-foreground">৳ {formatMoney(data.totalAmount)}</span>
          </div>
          {isVoided ? (
            <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              বাতিলকৃত বিক্রি। কারণ: {data.voidReason || "উল্লেখ নেই"}
            </p>
          ) : null}
          {data.note ? (
            <p className="text-sm text-muted-foreground">নোট: {data.note}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
