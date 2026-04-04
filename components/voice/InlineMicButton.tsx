"use client";

import { Mic } from "lucide-react";

type InlineMicButtonProps = {
  listening?: boolean;
  disabled?: boolean;
  onClick: () => void;
  ariaLabel: string;
};

export default function InlineMicButton({
  listening = false,
  disabled = false,
  onClick,
  ariaLabel,
}: InlineMicButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border text-sm transition ${
        listening
          ? "border-danger/30 bg-danger-soft text-danger"
          : "border-border bg-card text-muted-foreground hover:text-foreground"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <Mic className="h-4 w-4" />
    </button>
  );
}

