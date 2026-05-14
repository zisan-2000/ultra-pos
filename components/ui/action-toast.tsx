"use client";

/**
 * Generic action-result toast — use across the app.
 *
 *   showSuccessToast({ title: "বিক্রি সম্পন্ন", amount: 990, badge: "cash", ... })
 *   showInfoToast({ title: "পণ্য আপডেট হয়েছে" })
 *   showWarningToast({ title: "Stock কম", subtitle: "৫টির নিচে" })
 *   showErrorToast({ title: "সেভ করতে সমস্যা" })
 *
 * Supports: amount in Bengali numerals, payment-method badge presets,
 * meta pills, primary/secondary action buttons (Link or onClick),
 * draining progress bar, configurable duration, close button.
 */

import { useEffect, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  CheckCircle2,
  Info,
  AlertTriangle,
  XCircle,
  X,
  Banknote,
  Smartphone,
  CreditCard,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------- Bengali numeral utilities ----------

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

export function toBengaliNumerals(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

export function formatBengaliAmount(amount: number): string {
  const hasDecimals = Math.abs(amount % 1) > 0.0001;
  const formatted = amount.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: hasDecimals ? 2 : 0,
  });
  return toBengaliNumerals(formatted);
}

// ---------- Built-in badge presets ----------

type BadgePreset = {
  label: string;
  icon: LucideIcon;
  color: string;
};

const BADGE_PRESETS: Record<string, BadgePreset> = {
  cash:  { label: "ক্যাশ",  icon: Banknote,   color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  bkash: { label: "বিকাশ",  icon: Smartphone, color: "text-pink-700    bg-pink-50    border-pink-200"    },
  nagad: { label: "নগদ",   icon: Smartphone, color: "text-orange-700  bg-orange-50  border-orange-200"  },
  card:  { label: "কার্ড",  icon: CreditCard, color: "text-blue-700    bg-blue-50    border-blue-200"    },
  due:   { label: "বাকি",   icon: Clock,      color: "text-amber-700   bg-amber-50   border-amber-200"   },
};

// ---------- Variant styles ----------

type VariantKey = "success" | "info" | "warning" | "error";

const VARIANT_STYLES: Record<
  VariantKey,
  {
    accent: string;
    iconBg: string;
    iconColor: string;
    ring: string;
    amountColor: string;
    rail: string;
    icon: LucideIcon;
  }
> = {
  success: {
    accent: "bg-success",
    iconBg: "bg-success/10",
    iconColor: "text-success",
    ring: "ring-success/10",
    amountColor: "text-success",
    rail: "bg-success/15",
    icon: CheckCircle2,
  },
  info: {
    accent: "bg-blue-500",
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    ring: "ring-blue-100",
    amountColor: "text-blue-700",
    rail: "bg-blue-100",
    icon: Info,
  },
  warning: {
    accent: "bg-amber-500",
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    ring: "ring-amber-100",
    amountColor: "text-amber-700",
    rail: "bg-amber-100",
    icon: AlertTriangle,
  },
  error: {
    accent: "bg-red-500",
    iconBg: "bg-red-50",
    iconColor: "text-red-600",
    ring: "ring-red-100",
    amountColor: "text-red-700",
    rail: "bg-red-100",
    icon: XCircle,
  },
};

// ---------- Types ----------

export interface ToastAction {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
}

export interface ActionToastProps {
  /** Toast id from sonner — passed automatically by helpers */
  id: string | number;
  /** Bold title line, e.g. "বিক্রি সম্পন্ন" */
  title: string;
  /** Big amount line in Bengali numerals (optional) */
  amount?: number;
  /** Badge — pass preset name ("cash"/"bkash"/"nagad"/"card"/"due") or custom config */
  badge?: keyof typeof BADGE_PRESETS | { label: string; icon?: LucideIcon; color?: string };
  /** Secondary line under amount, e.g. "ইনভয়েস #1042" */
  subtitle?: string;
  /** Small pill metadata under subtitle, e.g. ["২ আইটেম", "রহিম মিয়া"] */
  meta?: string[];
  /** Action buttons — first is primary by default */
  actions?: ToastAction[];
  /** Color variant (default "success") */
  variant?: VariantKey;
  /** Custom icon override (default uses variant icon) */
  icon?: LucideIcon;
  /** Auto-dismiss in ms (default 5000) */
  duration?: number;
}

// ---------- Component ----------

export function ActionToast({
  id,
  title,
  amount,
  badge,
  subtitle,
  meta,
  actions,
  variant = "success",
  icon: IconOverride,
  duration = 5000,
}: ActionToastProps) {
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = progressRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.style.width = "0%";
    });
  }, []);

  const styles = VARIANT_STYLES[variant];
  const Icon = IconOverride ?? styles.icon;

  const badgeData =
    typeof badge === "string"
      ? BADGE_PRESETS[badge]
      : badge
      ? {
          label: badge.label,
          icon: badge.icon,
          color: badge.color ?? "text-muted-foreground bg-muted border-border",
        }
      : null;
  const BadgeIcon = badgeData?.icon;

  return (
    <div className="w-[min(92vw,22rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_16px_40px_rgba(15,23,42,0.14)]">
      {/* Draining progress bar */}
      <div className={cn("relative h-[3px] w-full", styles.rail)}>
        <div
          ref={progressRef}
          className={cn("absolute inset-y-0 left-0 rounded-full", styles.accent)}
          style={{ width: "100%", transition: `width ${duration}ms linear` }}
        />
      </div>

      <div className="px-4 pt-3.5 pb-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          {/* Icon badge */}
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-4",
              styles.iconBg,
              styles.iconColor,
              styles.ring
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={2.5} />
          </div>

          {/* Title + amount + subtitle */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-foreground leading-none">
                {title}
              </p>
              {badgeData && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                    badgeData.color
                  )}
                >
                  {BadgeIcon && <BadgeIcon className="h-3 w-3" />}
                  {badgeData.label}
                </span>
              )}
            </div>

            {amount !== undefined && (
              <p
                className={cn(
                  "mt-1.5 text-2xl font-extrabold leading-none tracking-tight",
                  styles.amountColor
                )}
              >
                ৳{formatBengaliAmount(amount)}
              </p>
            )}

            {subtitle && (
              <p className="mt-1 text-[11px] text-muted-foreground leading-tight">
                {subtitle}
              </p>
            )}

            {meta && meta.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {meta.map((m, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground leading-none"
                  >
                    {m}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={() => toast.dismiss(id)}
            aria-label="বন্ধ করুন"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Actions */}
        {actions && actions.length > 0 && (
          <>
            <div className="mt-3.5 border-t border-border/60" />
            <div className="mt-3 flex items-center gap-2">
              {actions.map((action, i) => {
                const isPrimary =
                  action.variant === "primary" ||
                  (!action.variant && i === 0 && actions.length > 1) ||
                  actions.length === 1;
                const className = isPrimary
                  ? cn(
                      "inline-flex h-8 flex-1 items-center justify-center rounded-xl px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90",
                      styles.accent
                    )
                  : "inline-flex h-8 items-center justify-center rounded-xl border border-border bg-muted/60 px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

                const handleClick = () => {
                  action.onClick?.();
                  toast.dismiss(id);
                };

                if (action.href) {
                  return (
                    <Link
                      key={i}
                      href={action.href}
                      onClick={handleClick}
                      className={className}
                    >
                      {action.label}
                    </Link>
                  );
                }
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={handleClick}
                    className={className}
                  >
                    {action.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Helper functions — call these directly from any component ----------

type ToastInput = Omit<ActionToastProps, "id" | "variant">;

export function showSuccessToast(props: ToastInput) {
  return toast.custom(
    (id) => <ActionToast id={id} variant="success" {...props} />,
    { duration: props.duration ?? 5000 }
  );
}

export function showInfoToast(props: ToastInput) {
  return toast.custom(
    (id) => <ActionToast id={id} variant="info" {...props} />,
    { duration: props.duration ?? 5000 }
  );
}

export function showWarningToast(props: ToastInput) {
  return toast.custom(
    (id) => <ActionToast id={id} variant="warning" {...props} />,
    { duration: props.duration ?? 5000 }
  );
}

export function showErrorToast(props: ToastInput) {
  return toast.custom(
    (id) => <ActionToast id={id} variant="error" {...props} />,
    { duration: props.duration ?? 5000 }
  );
}
