import Link from "next/link";
import { notFound } from "next/navigation";
import { getQueueTokenPrintData } from "@/app/actions/queue-tokens";
import {
  getQueueOrderTypeLabel,
  getQueueStatusLabel,
  resolveQueueWorkflowProfile,
} from "@/lib/queue-workflow";
import PrintQueueTokenButton from "./PrintQueueTokenButton";

type PageProps = {
  params: Promise<{ tokenId: string }>;
};

function formatDateTime(date: Date | null) {
  if (!date) return "N/A";
  return date.toLocaleString("bn-BD", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value: string | number) {
  const n = Number(value || 0);
  return n.toLocaleString("bn-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateOnly(date: Date | null) {
  if (!date) return "N/A";
  return date.toLocaleDateString("bn-BD", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function QueueTokenPrintPage({ params }: PageProps) {
  const { tokenId } = await params;

  let data: Awaited<ReturnType<typeof getQueueTokenPrintData>>;
  try {
    data = await getQueueTokenPrintData(tokenId);
  } catch (error) {
    if (
      error instanceof Error &&
      /(not found|forbidden|unauthorized)/i.test(error.message)
    ) {
      notFound();
    }
    throw error;
  }

  const workflowProfile = resolveQueueWorkflowProfile({
    queueWorkflow: (data.shop as any).queueWorkflow,
    businessType: data.shop.businessType,
  });
  const progressLabel =
    workflowProfile === "restaurant"
      ? "In Kitchen At"
      : workflowProfile === "salon"
      ? "In Service At"
      : "In Progress At";
  const doneLabel =
    workflowProfile === "restaurant" ? "Served At" : "Completed At";

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href={`/dashboard/queue?shopId=${data.shopId}`}
          className="inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
        >
          টোকেন বোর্ডে ফিরে যান
        </Link>
        <PrintQueueTokenButton />
      </div>

      <div id="queue-token-print-root" data-print-root>
        <article className="print-card overflow-hidden rounded-3xl border border-border bg-card shadow-[0_16px_38px_rgba(15,23,42,0.1)] print:rounded-none print:shadow-none">
          <header className="print-no-break border-b border-border bg-gradient-to-br from-muted/65 via-card to-card px-4 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-muted-foreground">
                  Queue Token
                </p>
                <h1 className="font-mono text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
                  {data.tokenLabel}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Issue সময়: <span className="font-semibold text-foreground">{formatDateTime(data.createdAt)}</span>
                </p>
              </div>

              <div className="min-w-[230px] rounded-2xl border border-border bg-card px-4 py-3 shadow-sm print:shadow-none">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">দোকান</p>
                <p className="mt-1 text-base font-bold text-foreground">{data.shop.name}</p>
                {data.shop.address ? (
                  <p className="mt-1 text-xs text-muted-foreground">{data.shop.address}</p>
                ) : null}
                {data.shop.phone ? (
                  <p className="mt-1 text-xs text-muted-foreground">ফোন: {data.shop.phone}</p>
                ) : null}
              </div>
            </div>
          </header>

          <section className="grid grid-cols-1 gap-3 border-b border-border px-4 py-4 sm:grid-cols-2 sm:px-6">
            <div className="rounded-xl border border-border bg-muted/35 p-3 sm:p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">অর্ডার</p>
              <p className="mt-1.5 text-base font-bold text-foreground">
                {getQueueOrderTypeLabel(data.orderType, workflowProfile)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Status: {getQueueStatusLabel(data.status, workflowProfile)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Date: {formatDateOnly(data.businessDate)}</p>
            </div>

            <div className="rounded-xl border border-border bg-muted/35 p-3 sm:p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Customer</p>
              <p className="mt-1.5 text-base font-bold text-foreground">
                {data.customerName || "Walk-in customer"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">ফোন: {data.customerPhone || "N/A"}</p>
            </div>
          </section>

          {data.note ? (
            <section className="border-b border-border px-4 py-4 sm:px-6">
              <div className="rounded-xl border border-border bg-muted/35 p-3">
                <p className="text-xs font-semibold text-muted-foreground">নোট</p>
                <p className="mt-1 text-sm text-foreground">{data.note}</p>
              </div>
            </section>
          ) : null}

          <section className="border-b border-border px-4 py-4 sm:px-6">
            <h2 className="text-sm font-semibold text-foreground">অর্ডার আইটেম</h2>
            <div className="mt-2 overflow-hidden rounded-xl border border-border">
              <div className="grid grid-cols-12 border-b border-border bg-muted/35 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <span className="col-span-6">আইটেম</span>
                <span className="col-span-2 text-right">Qty</span>
                <span className="col-span-2 text-right">Rate</span>
                <span className="col-span-2 text-right">Total</span>
              </div>
              <div className="divide-y divide-border">
                {data.items.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 px-3 py-2 text-sm">
                    <span className="col-span-6 text-foreground">{item.productName}</span>
                    <span className="col-span-2 text-right text-foreground">{item.quantity}</span>
                    <span className="col-span-2 text-right text-muted-foreground">
                      ৳ {formatMoney(item.unitPrice)}
                    </span>
                    <span className="col-span-2 text-right font-semibold text-foreground">
                      ৳ {formatMoney(item.lineTotal)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3 flex justify-end">
              <div className="w-full max-w-[240px] rounded-xl border border-border bg-muted/35 px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">মোট</span>
                  <span className="font-bold text-foreground">৳ {formatMoney(data.totalAmount)}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-3 border-b border-border px-4 py-4 sm:grid-cols-2 sm:px-6">
            <div className="rounded-xl border border-border bg-muted/35 p-3 text-sm">
              <p className="text-xs font-semibold text-muted-foreground">Called At</p>
              <p className="mt-1 font-medium text-foreground">{formatDateTime(data.calledAt)}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/35 p-3 text-sm">
              <p className="text-xs font-semibold text-muted-foreground">{progressLabel}</p>
              <p className="mt-1 font-medium text-foreground">{formatDateTime(data.inKitchenAt)}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/35 p-3 text-sm">
              <p className="text-xs font-semibold text-muted-foreground">Ready At</p>
              <p className="mt-1 font-medium text-foreground">{formatDateTime(data.readyAt)}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/35 p-3 text-sm">
              <p className="text-xs font-semibold text-muted-foreground">{doneLabel}</p>
              <p className="mt-1 font-medium text-foreground">{formatDateTime(data.servedAt)}</p>
            </div>
          </section>

          <footer className="print-no-break border-t border-border bg-muted/30 px-4 py-3 sm:px-6">
            <p className="text-center text-xs text-muted-foreground sm:text-sm">
              টোকেন নম্বর ধরে সার্ভিস দিন। সঠিক ক্রমে কাস্টমার ম্যানেজ করা সহজ হবে।
            </p>
          </footer>
        </article>
      </div>
    </div>
  );
}
