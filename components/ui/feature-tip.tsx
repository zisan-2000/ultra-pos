"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeatureTipProps {
  id: string;
  title: string;
  description: string;
  className?: string;
}

export function FeatureTip({ id, title, description, className }: FeatureTipProps) {
  const key = `feature-tip-seen-${id}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(key)) setVisible(true);
    } catch {
      // localStorage unavailable (SSR or private mode)
    }
  }, [key]);

  const dismiss = () => {
    try {
      localStorage.setItem(key, "1");
    } catch {
      // ignore
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className={cn(
        "absolute z-50 max-w-[240px] rounded-xl border border-primary/20 bg-card p-3 text-sm shadow-lg animate-fade-in",
        className
      )}
    >
      <button
        onClick={dismiss}
        className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="বন্ধ করুন"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <p className="pr-4 font-semibold text-foreground">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
