// components/LogoutButton.tsx

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { logout } from "@/app/actions/auth";

function SubmitButton({ variant }: { variant?: "default" | "menu" }) {
  const { pending } = useFormStatus();

  const className =
    variant === "menu"
      ? "w-full px-3 py-2 rounded-lg bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      : "w-full px-4 py-3 rounded-lg bg-red-600 text-white font-medium text-base hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors";

  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
    >
      {pending ? "লগ আউট হচ্ছে..." : "লগ আউট"}
    </button>
  );
}

export default function LogoutButton({
  variant,
}: {
  variant?: "default" | "menu";
}) {
  const [state, formAction] = useActionState(logout, { error: undefined });

  return (
    <form action={formAction} className="flex items-center gap-2">
      <SubmitButton variant={variant} />
      {state?.error ? (
        <span className="text-xs text-red-600">{state.error}</span>
      ) : null}
    </form>
  );
}
