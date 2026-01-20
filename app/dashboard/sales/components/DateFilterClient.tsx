// app/dashboard/sales/components/DateFilterClient.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

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

function getDhakaTodayStr() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(dateStr: string, days: number) {
  const date = parseDateParts(dateStr);
  if (!date) return dateStr;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getMonthStart(dateStr: string) {
  const date = parseDateParts(dateStr);
  if (!date) return dateStr;
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
  )
    .toISOString()
    .slice(0, 10);
}

export default function DateFilterClient({ shopId, from, to }: Props) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);
  const rangeText = useMemo(() => {
    // Check if this is "all time" range
    if (from === "1970-01-01" && to === "2099-12-31") {
      return "সর্বকাল";
    }
    if (from === to) {
      const today = getDhakaTodayStr();
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

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setCustomFrom(from);
    setCustomTo(to);
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

  const setPreset = (key: "today" | "yesterday" | "7d" | "month" | "all") => {
    const today = getDhakaTodayStr();
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
      return;
    }
    // all time
    applyRange("1970-01-01", "2099-12-31");
  };

  const canApplyCustom =
    Boolean(customFrom) && Boolean(customTo) && customFrom <= customTo;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-border bg-card/90 px-3 text-sm font-semibold text-foreground shadow-[0_1px_0_rgba(0,0,0,0.03)] hover:bg-muted transition sm:inline-flex sm:w-auto sm:min-w-[200px]"
      >
        <span className="shrink-0">📅</span>
        <span className="min-w-0 flex-1 text-left text-sm truncate">
          {rangeText}
        </span>
      </button>

      {mounted &&
        open &&
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
                <button
                  type="button"
                  onClick={() => setPreset("today")}
                  className="rounded-lg border border-border px-3 py-2 font-semibold text-foreground hover:bg-muted"
                >
                  আজ
                </button>
                <button
                  type="button"
                  onClick={() => setPreset("yesterday")}
                  className="rounded-lg border border-border px-3 py-2 font-semibold text-foreground hover:bg-muted"
                >
                  গতকাল
                </button>
                <button
                  type="button"
                  onClick={() => setPreset("7d")}
                  className="rounded-lg border border-border px-3 py-2 font-semibold text-foreground hover:bg-muted"
                >
                  ৭ দিন
                </button>
                <button
                  type="button"
                  onClick={() => setPreset("month")}
                  className="rounded-lg border border-border px-3 py-2 font-semibold text-foreground hover:bg-muted"
                >
                  এই মাস
                </button>
                <button
                  type="button"
                  onClick={() => setPreset("all")}
                  className="rounded-lg border border-border px-3 py-2 font-semibold text-foreground hover:bg-muted sm:col-span-1"
                >
                  সব
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground">
                  Custom range
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="h-11 w-full rounded-lg border border-border px-3 text-sm"
                  />
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="h-11 w-full rounded-lg border border-border px-3 text-sm"
                  />
                </div>
                <button
                  type="button"
                  disabled={!canApplyCustom}
                  onClick={() => applyRange(customFrom, customTo)}
                  className="w-full rounded-lg bg-primary-soft text-primary border border-primary/30 py-2.5 text-sm font-semibold hover:bg-primary/15 hover:border-primary/40 disabled:opacity-60"
                >
                  রেঞ্জ প্রয়োগ করুন
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
