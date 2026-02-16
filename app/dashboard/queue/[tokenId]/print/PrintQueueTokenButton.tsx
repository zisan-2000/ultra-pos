"use client";

export default function PrintQueueTokenButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-10 items-center rounded-full border border-primary/30 bg-primary-soft px-4 text-sm font-semibold text-primary hover:bg-primary/15"
    >
      প্রিন্ট
    </button>
  );
}
