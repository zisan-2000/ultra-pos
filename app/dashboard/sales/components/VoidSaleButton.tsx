"use client";

import { useFormStatus } from "react-dom";

type VoidSaleButtonProps = {
  isVoided: boolean;
};

export function VoidSaleButton({ isVoided }: VoidSaleButtonProps) {
  const { pending } = useFormStatus();

  const disabled = isVoided || pending;

  return (
    <button
      type="submit"
      disabled={disabled}
      className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
        isVoided
          ? "border-slate-200 text-slate-400 bg-slate-50 cursor-not-allowed"
          : pending
          ? "border-red-200 text-red-700 bg-red-50 cursor-wait"
          : "border-red-200 text-red-700 bg-red-50 hover:bg-red-100 hover:border-red-300"
      }`}
    >
      {isVoided ? "বাতিল হয়েছে" : pending ? "বাতিল হচ্ছে..." : "বিক্রি বাতিল করুন"}
    </button>
  );
}
