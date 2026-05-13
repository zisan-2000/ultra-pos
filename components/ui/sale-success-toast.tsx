"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2, X, Banknote, Smartphone, CreditCard, Clock } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export interface SaleSuccessToastProps {
  id: string | number;
  saleId?: string;
  invoiceNo?: string | null;
  amount: number;
  paymentMethod: string;
  shopId: string;
}

const METHOD_MAP: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  cash:  { label: "ক্যাশ",  icon: <Banknote   className="h-3 w-3" />, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  bkash: { label: "বিকাশ",  icon: <Smartphone  className="h-3 w-3" />, color: "text-pink-600   bg-pink-50   border-pink-200"   },
  nagad: { label: "নগদ",   icon: <Smartphone  className="h-3 w-3" />, color: "text-orange-600 bg-orange-50 border-orange-200" },
  card:  { label: "কার্ড",  icon: <CreditCard  className="h-3 w-3" />, color: "text-blue-600  bg-blue-50   border-blue-200"   },
  due:   { label: "বাকি",   icon: <Clock       className="h-3 w-3" />, color: "text-amber-600  bg-amber-50  border-amber-200"  },
};

export function SaleSuccessToast({
  id,
  saleId,
  invoiceNo,
  amount,
  paymentMethod,
  shopId,
}: SaleSuccessToastProps) {
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = progressRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.style.width = "0%";
    });
  }, []);

  const method = METHOD_MAP[paymentMethod] ?? {
    label: paymentMethod,
    icon: null,
    color: "text-muted-foreground bg-muted border-border",
  };

  const formattedAmount = amount.toLocaleString("en-BD");

  return (
    <div className="w-[min(92vw,22rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_16px_40px_rgba(15,23,42,0.14)]">
      {/* Draining progress bar */}
      <div className="relative h-[3px] w-full bg-success/15">
        <div
          ref={progressRef}
          className="absolute inset-y-0 left-0 rounded-full bg-success"
          style={{ width: "100%", transition: "width 5s linear" }}
        />
      </div>

      <div className="px-4 pt-3.5 pb-4">
        {/* Header row: icon + text + close */}
        <div className="flex items-start gap-3">
          {/* Icon badge */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success/10 text-success ring-4 ring-success/8">
            <CheckCircle2 className="h-5 w-5" strokeWidth={2.5} />
          </div>

          {/* Title + amount */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-foreground leading-none">বিক্রি সম্পন্ন</p>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${method.color}`}
              >
                {method.icon}
                {method.label}
              </span>
            </div>
            <p className="mt-1.5 text-2xl font-extrabold text-success leading-none tracking-tight">
              ৳{formattedAmount}
            </p>
            {invoiceNo ? (
              <p className="mt-1 text-[11px] text-muted-foreground leading-none">
                ইনভয়েস{" "}
                <span className="font-semibold text-foreground">#{invoiceNo}</span>
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground leading-none">
                বিল সফলভাবে সংরক্ষিত
              </p>
            )}
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={() => toast.dismiss(id)}
            aria-label="বন্ধ করুন"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Divider */}
        {saleId && <div className="mt-3.5 border-t border-border/60" />}

        {/* Action buttons */}
        {saleId && (
          <div className="mt-3 flex items-center gap-2">
            {invoiceNo ? (
              <Link
                href={`/dashboard/sales/${saleId}/invoice?shopId=${shopId}`}
                onClick={() => toast.dismiss(id)}
                className="inline-flex h-8 flex-1 items-center justify-center rounded-xl bg-success px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                ইনভয়েস দেখুন →
              </Link>
            ) : null}
            <Link
              href={`/dashboard/sales?shopId=${shopId}`}
              onClick={() => toast.dismiss(id)}
              className={`inline-flex h-8 items-center justify-center rounded-xl border border-border bg-muted/60 px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${invoiceNo ? "" : "flex-1"}`}
            >
              তালিকায় যান
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
