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
          ? "border-border text-muted-foreground bg-muted cursor-not-allowed"
          : pending
          ? "border-danger/30 text-danger bg-danger-soft cursor-wait"
          : "border-danger/30 text-danger bg-danger-soft hover:bg-danger-soft/70 hover:border-danger/50"
      }`}
    >
      {isVoided ? "বাতিল হয়েছে" : pending ? "বাতিল হচ্ছে..." : "বিক্রি বাতিল করুন"}
    </button>
  );
}
