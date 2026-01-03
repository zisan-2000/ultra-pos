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

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("bn-BD", {
    month: "short",
    day: "numeric",
  });
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function DateFilterClient({ shopId, from, to }: Props) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);
  const rangeText = useMemo(
    () =>
      from === to
        ? `আজ · ${formatDate(from)}`
        : `${formatDate(from)} – ${formatDate(to)}`,
    [from, to]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const applyRange = (nextFrom: string, nextTo: string) => {
    const params = new URLSearchParams({
      shopId,
      from: nextFrom,
      to: nextTo,
    });
    router.push(`/dashboard/sales?${params.toString()}`);
    setOpen(false);
  };

  const setPreset = (key: "today" | "yesterday" | "last7") => {
    if (key === "today") {
      const d = todayStr();
      applyRange(d, d);
      return;
    }
    if (key === "yesterday") {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const fromY = `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(
        2,
        "0"
      )}-${`${d.getDate()}`.padStart(2, "0")}`;
      applyRange(fromY, fromY);
      return;
    }
    // last 7 days
    const end = todayStr();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 6);
    const start = `${startDate.getFullYear()}-${`${startDate.getMonth() + 1}`.padStart(2, "0")}-${`${startDate.getDate()}`.padStart(2, "0")}`;
    applyRange(start, end);
  };

  const canApplyCustom =
    Boolean(customFrom) && Boolean(customTo) && customFrom <= customTo;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm font-semibold text-foreground border border-border hover:bg-secondary transition"
      >
        <span>📅</span>
        <span className="text-sm">{rangeText}</span>
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
              className="absolute left-1/2 top-[72px] w-[92%] max-w-md -translate-x-1/2 rounded-2xl bg-card border border-border shadow-2xl p-4 space-y-4"
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

              <div className="grid grid-cols-3 gap-2 text-sm">
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
                  onClick={() => setPreset("last7")}
                  className="rounded-lg border border-border px-3 py-2 font-semibold text-foreground hover:bg-muted"
                >
                  শেষ ৭ দিন
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
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                  />
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="button"
                  disabled={!canApplyCustom}
                  onClick={() => applyRange(customFrom, customTo)}
                  className="w-full rounded-lg bg-primary-soft text-primary border border-primary/30 py-2 text-sm font-semibold hover:bg-primary/15 hover:border-primary/40 disabled:opacity-60"
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
