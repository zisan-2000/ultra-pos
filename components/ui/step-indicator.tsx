"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  id: string;
  label: string;
}

interface StepIndicatorProps {
  steps: Step[];
  current: string;
  className?: string;
}

export function StepIndicator({ steps, current, className }: StepIndicatorProps) {
  const currentIndex = steps.findIndex((s) => s.id === current);

  return (
    <ol
      aria-label="ধাপসমূহ"
      className={cn("flex items-center list-none", className)}
    >
      {steps.map((step, i) => (
        <li
          key={step.id}
          className="flex items-center flex-1 min-w-0"
          aria-current={i === currentIndex ? "step" : undefined}
        >
          <div className="flex items-center gap-1.5 shrink-0">
            <div
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors",
                i < currentIndex
                  ? "bg-primary text-primary-foreground"
                  : i === currentIndex
                  ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                  : "bg-muted text-muted-foreground"
              )}
              aria-hidden="true"
            >
              {i < currentIndex ? (
                <Check className="h-3 w-3" strokeWidth={2.5} />
              ) : (
                i + 1
              )}
            </div>
            <span
              className={cn(
                "text-xs font-medium truncate max-w-16",
                i <= currentIndex ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {step.label}
              {i < currentIndex && <span className="sr-only"> (সম্পন্ন)</span>}
              {i === currentIndex && <span className="sr-only"> (বর্তমান)</span>}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              aria-hidden="true"
              className={cn(
                "h-px flex-1 mx-2 min-w-3 transition-colors",
                i < currentIndex ? "bg-primary" : "bg-border"
              )}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
