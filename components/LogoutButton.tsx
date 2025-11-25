// components/LogoutButton.tsx

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { logout } from "@/app/actions/auth";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3 py-1 rounded border bg-white text-sm hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {pending ? "Signing out..." : "Logout"}
    </button>
  );
}

export default function LogoutButton() {
  const [state, formAction] = useActionState(logout, { error: undefined });

  return (
    <form action={formAction} className="flex items-center gap-2">
      <SubmitButton />
      {state?.error ? (
        <span className="text-xs text-red-600">{state.error}</span>
      ) : null}
    </form>
  );
}
