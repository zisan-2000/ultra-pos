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
        className={`px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
          active === "today" ? "bg-green-600 text-white border-green-600" : "border-gray-300 text-gray-900 hover:bg-gray-100"
        }`}
      >
        আজ
      </button>

      <button
        onClick={() => {
          setActive("month");
          onSelect(format(firstOfMonth), format(today));
        }}
        className={`px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
          active === "month" ? "bg-green-600 text-white border-green-600" : "border-gray-300 text-gray-900 hover:bg-gray-100"
        }`}
      >
        এই মাস
      </button>

      <button
        onClick={() => {
          setActive("all");
          onSelect(undefined, undefined);
        }}
        className={`px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
          active === "all" ? "bg-green-600 text-white border-green-600" : "border-gray-300 text-gray-900 hover:bg-gray-100"
        }`}
      >
        সব সময়
      </button>
    </div>
  );
}
