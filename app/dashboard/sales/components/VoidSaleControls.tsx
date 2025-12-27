// app/dashboard/sales/components/VoidSaleControls.tsx

"use client";

import { useEffect, useState } from "react";
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
      className="inline-flex items-center justify-center rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-60"
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (isVoided) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-[11px] font-semibold text-red-700 border border-red-100">
        ❌ ইতিমধ্যেই বাতিল
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 bg-white hover:bg-red-50 transition"
      >
        ❌ বাতিল করুন
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end bg-black/40 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded-t-2xl bg-white shadow-2xl border-t border-slate-100 p-4 space-y-4"
            >
              <input type="hidden" name="saleId" value={saleId} form={formId} />

              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-600 border border-red-100">
                  ⚠️
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-slate-900">
                    বিক্রি বাতিল করলে টাকা ফেরত যাবে
                  </h3>
                  <p className="text-sm text-slate-600">
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
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
                />
                <p className="text-[11px] text-slate-500">
                  এই ধাপ দুর্ঘটনাবশত Void হওয়া ঠেকাতে যুক্ত করা হয়েছে।
                </p>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
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
