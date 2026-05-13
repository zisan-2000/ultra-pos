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
  const progressPercent =
    steps.length > 1 ? (currentIndex / (steps.length - 1)) * 100 : 0;

  return (
    <div className={cn("relative select-none", className)}>
      {/*
       * Track sits at top-3.5 (= half of h-7 circle) so it threads
       * through the vertical centre of every circle.
       * left-3.5 / right-3.5 anchors it at each circle's centre.
       */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 right-3.5 top-3.5 h-px"
      >
        {/* background rail */}
        <div className="absolute inset-0 rounded-full bg-border/60" />
        {/* filled progress */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <ol
        aria-label="ধাপসমূহ"
        className="relative flex list-none justify-between"
      >
        {steps.map((step, i) => {
          const isCompleted = i < currentIndex;
          const isActive = i === currentIndex;
          const isFirst = i === 0;
          const isLast = i === steps.length - 1;

          return (
            <li
              key={step.id}
              aria-current={isActive ? "step" : undefined}
              className={cn(
                "flex flex-col gap-1.5",
                isFirst ? "items-start" : isLast ? "items-end" : "items-center"
              )}
            >
              {/* Circle */}
              <div
                aria-hidden="true"
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all duration-300",
                  isCompleted
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : isActive
                    ? "scale-110 bg-primary text-primary-foreground ring-4 ring-primary/20 shadow-md"
                    : "border-2 border-border bg-card text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                ) : (
                  i + 1
                )}
              </div>

              {/* Label — below the circle, never competes for horizontal space */}
              <span
                className={cn(
                  "whitespace-nowrap text-[11px] font-medium leading-none transition-all duration-200",
                  isActive
                    ? "font-semibold text-primary"
                    : isCompleted
                    ? "text-muted-foreground"
                    : "text-muted-foreground/50"
                )}
              >
                {step.label}
                {isCompleted && <span className="sr-only"> (সম্পন্ন)</span>}
                {isActive && <span className="sr-only"> (বর্তমান)</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
