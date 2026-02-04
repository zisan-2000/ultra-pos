// app/dashboard/sales/components/VoidSaleControls.tsx

"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createPortal } from "react-dom";

type VoidSaleControlsProps = {
  saleId: string;
  isVoided: boolean;
  formId: string;
};

type SubmitButtonProps = {
  formId: string;
};

function SubmitButton({ formId }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      form={formId}
      disabled={pending}
      className="inline-flex items-center justify-center rounded-full bg-destructive px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-destructive/90 disabled:opacity-60"
    >
      {pending ? "বাতিল হচ্ছে..." : "চূড়ান্ত বাতিল"}
    </button>
  );
}

export function VoidSaleControls({
  saleId,
  isVoided,
  formId,
}: VoidSaleControlsProps) {
  const [open, setOpen] = useState(false);

  if (isVoided) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-3 py-1 text-xs font-semibold text-danger border border-danger/30">
        ❌ ইতিমধ্যেই বাতিল
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border border-danger/30 px-3 py-2 text-sm font-semibold text-danger bg-card hover:bg-danger-soft/60 transition"
      >
        ❌ বাতিল করুন
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end bg-foreground/30 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded-t-2xl bg-card shadow-2xl border-t border-border p-4 space-y-4"
            >
              <input type="hidden" name="saleId" value={saleId} form={formId} />

              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-danger-soft text-danger border border-danger/30">
                  ⚠️
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-foreground">
                    বিক্রি বাতিল করলে টাকা ফেরত যাবে
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    নিশ্চিত হলে কারণ লিখে চূড়ান্ত বাতিল করুন।
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  name="reason"
                  form={formId}
                  placeholder="কারণ (ঐচ্ছিক)"
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-danger/30"
                />
                <p className="text-xs text-muted-foreground">
                  এই ধাপ দুর্ঘটনাবশত Void হওয়া ঠেকাতে যুক্ত করা হয়েছে।
                </p>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                >
                  ফিরে যান
                </button>
                <SubmitButton formId={formId} />
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

