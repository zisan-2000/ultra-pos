"use client";

import { useState, useTransition } from "react";
import { stopImpersonation } from "@/app/actions/impersonation";

export default function StopImpersonationButton({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const result = await stopImpersonation();
              window.location.assign(result?.redirectTo || "/dashboard");
            } catch (err) {
              setError("ইমপার্সোনেশন বন্ধ করা যায়নি");
            }
          });
        }}
        className={
          compact
            ? "inline-flex h-8 items-center justify-center rounded-full border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
            : "inline-flex h-10 items-center justify-center rounded-full border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
        }
      >
        {pending ? "ফিরছে..." : "ইমপার্সোনেশন বন্ধ করুন"}
      </button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
