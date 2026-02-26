import Link from "next/link";
import { notFound } from "next/navigation";
import { getSaleReturnDraft } from "@/app/actions/sales";
import ReturnSaleClient from "./ReturnSaleClient";

type PageProps = {
  params: Promise<{ saleId: string }>;
};

export default async function SaleReturnPage({ params }: PageProps) {
  const { saleId } = await params;

  let draft: Awaited<ReturnType<typeof getSaleReturnDraft>>;
  try {
    draft = await getSaleReturnDraft(saleId);
  } catch (error) {
    if (error instanceof Error && /not found/i.test(error.message)) {
      notFound();
    }
    if (error instanceof Error && /forbidden|permission/i.test(error.message)) {
      return (
        <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6 bn-typography">
          <div className="rounded-2xl border border-border bg-card p-6 text-center">
            <h1 className="text-2xl font-bold text-foreground">বিক্রি রিটার্ন</h1>
            <p className="mt-2 text-danger font-semibold">অ্যাকসেস সীমাবদ্ধ</p>
            <p className="mt-2 text-sm text-muted-foreground">
              সেল রিটার্ন ম্যানেজ করার অনুমতি আপনার নেই।
            </p>
            <Link
              href="/dashboard/sales"
              className="inline-flex mt-5 h-10 items-center rounded-full border border-primary/30 bg-primary-soft px-4 text-sm font-semibold text-primary hover:bg-primary/15 hover:border-primary/40"
            >
              বিক্রিতে ফিরুন
            </Link>
          </div>
        </div>
      );
    }
    throw error;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6 bn-typography">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">বিক্রি রিটার্ন / এক্সচেঞ্জ</h1>
          <p className="text-sm text-muted-foreground">
            বিক্রির আইডি: <span className="font-semibold text-foreground">{draft.sale.id}</span>
            {draft.sale.invoiceNo ? (
              <>
                {" "}
                · ইনভয়েস:{" "}
                <span className="font-semibold text-foreground">{draft.sale.invoiceNo}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/sales/${draft.sale.id}/invoice`}
            className="inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
          >
            ইনভয়েস
          </Link>
          <Link
            href="/dashboard/sales"
            className="inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
          >
            বিক্রিতে ফিরে যান
          </Link>
        </div>
      </div>

      <ReturnSaleClient initialDraft={draft} />
    </div>
  );
}
