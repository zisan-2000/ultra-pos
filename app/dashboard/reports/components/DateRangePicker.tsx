"use client";

import { useState } from "react";

export function DateRangePicker({
  onChange,
}: {
  onChange: (from: string, to: string) => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        className="border p-1 rounded"
        value={from}
        onChange={(e) => {
          setFrom(e.target.value);
          onChange(e.target.value, to);
        }}
      />

      <span>to</span>

      <input
        type="date"
        className="border p-1 rounded"
        value={to}
        onChange={(e) => {
          setTo(e.target.value);
          onChange(from, e.target.value);
        }}
      />
    </div>
  );
}
