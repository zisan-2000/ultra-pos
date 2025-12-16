// app/dashboard/sales/components/VoidSaleControls.tsx

"use client";

import { useState, useEffect } from "react";
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
      className="px-4 py-2 text-sm rounded-md bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-60"
    >
      {pending ? "প্রসেস হচ্ছে..." : "নিশ্চিত করুন"}
    </button>
  );
}

export function VoidSaleControls({ saleId, isVoided, formId }: VoidSaleControlsProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (isVoided) {
    return (
      <span className="text-xs text-slate-400">
        এই বিক্রিটি বাতিল করা যাবে না
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 rounded-md text-xs font-semibold border border-red-200 text-red-600 bg-white hover:bg-red-50 transition"
      >
        বিক্রি বাতিল
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)} // ⬅ outside click
          >
            <div
              onClick={(e) => e.stopPropagation()} // ⬅ prevent close on modal click
              className="w-full mx-4 sm:mx-0 sm:max-w-md max-w-[calc(100%-2rem)] rounded-xl bg-white shadow-xl border border-slate-200"
            >
              <input type="hidden" name="saleId" value={saleId} form={formId} />

              {/* Header */}
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-base font-semibold text-slate-900">
                  বিক্রি বাতিল নিশ্চিতকরণ
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  আপনি কি নিশ্চিত যে এই বিক্রিটি বাতিল করতে চান?
                </p>
              </div>

              {/* Body */}
              <div className="px-5 py-4 space-y-3">
                <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                  <ul className="list-disc list-inside space-y-1">
                    <li>মোট বিক্রির রিপোর্টে গণনা হবে না</li>
                    <li>অডিট ও হিসাবের জন্য রেকর্ড থাকবে</li>
                    <li>এই কাজটি পরে আর ফেরানো যাবে না</li>
                  </ul>
                </div>

                <input
                  type="text"
                  name="reason"
                  form={formId}
                  placeholder="বাতিলের কারণ (ঐচ্ছিক)"
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
                />
              </div>

              {/* Footer */}
              <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 text-sm rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  বাতিল
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
