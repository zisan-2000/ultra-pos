"use client";

import { useState } from "react";

type Props = {
  onSelect: (from?: string, to?: string) => void;
};

export function QuickDateFilter({ onSelect }: Props) {
  const [active, setActive] = useState<"today" | "month" | "all">("all");

  function format(d: Date) {
    return d.toISOString().split("T")[0];
  }

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => {
          setActive("today");
          onSelect(format(today), format(today));
        }}
        className={`px-2 py-1 border rounded text-xs ${
          active === "today" ? "bg-black text-white" : ""
        }`}
      >
        Today
      </button>

      <button
        onClick={() => {
          setActive("month");
          onSelect(format(firstOfMonth), format(today));
        }}
        className={`px-2 py-1 border rounded text-xs ${
          active === "month" ? "bg-black text-white" : ""
        }`}
      >
        This Month
      </button>

      <button
        onClick={() => {
          setActive("all");
          onSelect(undefined, undefined);
        }}
        className={`px-2 py-1 border rounded text-xs ${
          active === "all" ? "bg-black text-white" : ""
        }`}
      >
        All Time
      </button>
    </div>
  );
}
