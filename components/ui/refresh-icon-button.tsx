"use client";

import { RotateCw } from "lucide-react";

type RefreshIconButtonProps = {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
  className?: string;
};

export default function RefreshIconButton({
  onClick,
  loading = false,
  disabled = false,
  label = "রিফ্রেশ",
  className = "",
}: RefreshIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={loading ? `${label} হচ্ছে` : label}
      title={loading ? `${label} হচ্ছে` : label}
      className={`inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card/90 px-3 text-sm font-semibold text-muted-foreground shadow-sm transition hover:border-primary/30 hover:bg-primary-soft/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      <RotateCw
        className={`h-4 w-4 ${loading ? "animate-spin text-primary" : ""}`}
      />
      <span className="hidden sm:inline">{loading ? "রিফ্রেশ হচ্ছে" : label}</span>
    </button>
  );
}
