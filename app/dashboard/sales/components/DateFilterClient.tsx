// app/dashboard/sales/components/DateFilterClient.tsx

"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  getDateRangeSpanDays,
  getDhakaDateString,
} from "@/lib/reporting-range";
import { REPORT_MAX_RANGE_DAYS } from "@/lib/reporting-config";

type Props = {
  shopId: string;
  from: string;
  to: string;
};

const DHAKA_TIMEZONE = "Asia/Dhaka";

function parseDateParts(value: string) {
  const [y, m, d] = value.split("-").map((v) => Number(v));
  if (!y || !m || !d) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: string) {
  const date = parseDateParts(value);
  if (!date) return value;
  return new Intl.DateTimeFormat("bn-BD", {
    timeZone: DHAKA_TIMEZONE,
    month: "short",
    day: "numeric",
  }).format(date);
}

function addDays(dateStr: string, days: number) {
  const date = parseDateParts(dateStr);
  if (!date) return dateStr;
  date.setUTCDate(date.getUTCDate() + days);
  return getDhakaDateString(date);
}

function getMonthStart(dateStr: string) {
  const date = parseDateParts(dateStr);
  if (!date) return dateStr;
  return getDhakaDateString(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  );
}

export default function DateFilterClient({ shopId, from, to }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);
  const rangeText = useMemo(() => {
    if (from === to) {
      const today = getDhakaDateString();
      const yesterday = addDays(today, -1);
      if (from === today) {
        return `আজ · ${formatDate(from)}`;
      }
      if (from === yesterday) {
        return `গতকাল · ${formatDate(from)}`;
      }
      return formatDate(from);
    }
    return `${formatDate(from)} - ${formatDate(to)}`;
  }, [from, to]);

  const applyRange = (nextFrom: string, nextTo: string) => {
    const params = new URLSearchParams({
      shopId,
      from: nextFrom,
      to: nextTo,
    });
    router.push(`/dashboard/sales?${params.toString()}`);
    setOpen(false);
  };

  const setPreset = (key: "today" | "yesterday" | "7d" | "month") => {
    const today = getDhakaDateString();
    if (key === "today") {
      applyRange(today, today);
      return;
    }
    if (key === "yesterday") {
      const fromY = addDays(today, -1);
      applyRange(fromY, fromY);
      return;
    }
    if (key === "7d") {
      // last 7 days
      const end = today;
      const start = addDays(today, -6);
      applyRange(start, end);
      return;
    }
    if (key === "month") {
      // this month
      const startStr = getMonthStart(today);
      applyRange(startStr, today);
    }
  };

  const activePreset = useMemo(() => {
    const today = getDhakaDateString();
    const yesterday = addDays(today, -1);
    const sevenDayStart = addDays(today, -6);
    const monthStart = getMonthStart(today);
    if (from === today && to === today) return "today";
    if (from === yesterday && to === yesterday) return "yesterday";
    if (from === sevenDayStart && to === today) return "7d";
    if (from === monthStart && to === today) return "month";
    return "custom";
  }, [from, to]);

  const customRangeValidation = useMemo(() => {
    if (!customFrom || !customTo) {
      return {
        isValid: false,
        message: `শুরুর ও শেষের তারিখ দিন (সর্বোচ্চ ${REPORT_MAX_RANGE_DAYS} দিন)।`,
      };
    }
    if (customFrom > customTo) {
      return {
        isValid: false,
        message: "শুরুর তারিখ শেষের তারিখের আগে হতে হবে।",
      };
    }
    const span = getDateRangeSpanDays(customFrom, customTo);
    if (!span) {
      return {
        isValid: false,
        message: "সঠিক তারিখ দিন (YYYY-MM-DD)।",
      };
    }
    if (span > REPORT_MAX_RANGE_DAYS) {
      return {
        isValid: false,
        message: `সর্বোচ্চ ${REPORT_MAX_RANGE_DAYS} দিনের রেঞ্জ নির্বাচন করুন।`,
      };
    }
    return {
      isValid: true,
      message: `রেঞ্জ: ${span} দিন (সর্বোচ্চ ${REPORT_MAX_RANGE_DAYS} দিন)।`,
    };
  }, [customFrom, customTo]);
  const canApplyCustom = customRangeValidation.isValid;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setCustomFrom(from);
          setCustomTo(to);
          setOpen(true);
        }}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-border bg-card/90 px-3 text-sm font-semibold text-foreground shadow-[0_1px_0_rgba(0,0,0,0.03)] hover:bg-muted transition sm:inline-flex sm:w-auto sm:min-w-[200px]"
      >
        <span className="shrink-0">📅</span>
        <span className="min-w-0 flex-1 text-left text-sm truncate">
          {rangeText}
        </span>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-foreground/30 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-x-0 bottom-0 w-full rounded-t-2xl bg-card border border-border shadow-2xl p-4 space-y-4 sm:inset-auto sm:left-1/2 sm:top-[72px] sm:w-[92%] sm:max-w-md sm:-translate-x-1/2 sm:rounded-2xl"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    তারিখ বাছাই
                  </p>
                  <p className="text-xs text-muted-foreground">{rangeText}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-muted-foreground text-sm"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                {(["today", "yesterday", "7d", "month"] as const).map((key) => {
                  const label = { today: "আজ", yesterday: "গতকাল", "7d": "৭ দিন", month: "এই মাস" }[key];
                  const isActive = activePreset === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPreset(key)}
                      className={`rounded-full border px-3 py-2 font-semibold transition ${
                        isActive
                          ? "bg-primary-soft text-primary border-primary/30 shadow-sm"
                          : "border-border text-foreground hover:border-primary/30 hover:bg-primary-soft/40"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground">
                  কাস্টম রেঞ্জ
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="h-11 w-full rounded-xl border border-border px-3 text-sm bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="h-11 w-full rounded-xl border border-border px-3 text-sm bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <button
                  type="button"
                  disabled={!canApplyCustom}
                  onClick={() => applyRange(customFrom, customTo)}
                  className="w-full rounded-xl bg-primary-soft text-primary border border-primary/30 py-2.5 text-sm font-semibold hover:bg-primary/15 hover:border-primary/40 disabled:opacity-60"
                >
                  রেঞ্জ প্রয়োগ করুন
                </button>
                {customRangeValidation.message ? (
                  <p
                    className={`text-[11px] ${
                      customRangeValidation.isValid
                        ? "text-muted-foreground"
                        : "text-danger"
                    }`}
                  >
                    {customRangeValidation.message}
                  </p>
                ) : null}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
