"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  computeRange,
  getDhakaDateString,
  type RangePreset,
} from "@/lib/reporting-range";

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: "today", label: "আজ" },
  { key: "yesterday", label: "গতকাল" },
  { key: "7d", label: "৭ দিন" },
  { key: "month", label: "এই মাস" },
  { key: "custom", label: "কাস্টম" },
];

function resolvePreset(from?: string, to?: string): RangePreset {
  if (!from && !to) return "today";
  if (!from || !to) return "custom";
  const today = getDhakaDateString();
  if (from === to) {
    if (from === today) return "today";
    const yesterday = computeRange("yesterday");
    if (from === yesterday.from) return "yesterday";
    return "custom";
  }
  const seven = computeRange("7d");
  if (from === seven.from && to === seven.to) return "7d";
  const month = computeRange("month");
  if (from === month.from && to === month.to) return "month";
  return "custom";
}

type Props = {
  shopId: string;
  from: string;
  to: string;
};

export default function PurchaseDateFilterClient({ shopId, from, to }: Props) {
  const router = useRouter();
  const [preset, setPreset] = useState<RangePreset>(resolvePreset(from, to));
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  const rangeLabel =
    preset === "today" ? "আজ"
    : preset === "yesterday" ? "গতকাল"
    : preset === "7d" ? "শেষ ৭ দিন"
    : preset === "month" ? "এই মাস"
    : from === to ? from : `${from} — ${to}`;

  function applyRange(nextFrom: string, nextTo: string) {
    const params = new URLSearchParams();
    params.set("shopId", shopId);
    params.set("from", nextFrom);
    params.set("to", nextTo);
    router.push(`/dashboard/purchases?${params.toString()}`, { scroll: false });
    router.refresh();
  }

  function handlePresetClick(key: RangePreset) {
    setPreset(key);
    if (key !== "custom") {
      const range = computeRange(key);
      applyRange(range.from!, range.to!);
    }
  }

  const canApply =
    customFrom && customTo && customFrom <= customTo;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="rounded-xl border border-border/70 bg-background/80 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground">সময়</p>
          <span className="max-w-[160px] truncate text-xs text-muted-foreground">
            {rangeLabel}
          </span>
        </div>

        <div className="relative">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pr-10 py-0.5">
            {PRESETS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => handlePresetClick(key)}
                className={`px-3.5 py-2 rounded-full text-sm font-semibold whitespace-nowrap border transition ${
                  preset === key
                    ? "bg-primary-soft text-primary border-primary/30 shadow-sm"
                    : "bg-card text-foreground border-border/70 hover:border-primary/30 hover:bg-primary-soft/40"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-card to-transparent" />
        </div>

        {preset === "custom" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-11 rounded-xl border border-border bg-card px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-11 rounded-xl border border-border bg-card px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="button"
              disabled={!canApply}
              onClick={() => {
                if (!canApply) return;
                applyRange(customFrom, customTo);
              }}
              className="col-span-2 sm:col-span-1 h-11 rounded-xl bg-primary-soft text-primary border border-primary/30 text-sm font-semibold hover:bg-primary/15 hover:border-primary/40 transition-colors disabled:opacity-60"
            >
              রেঞ্জ প্রয়োগ করুন
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
