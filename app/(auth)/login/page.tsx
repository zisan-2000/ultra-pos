"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";

export default function LoginPage() {
  const [state, formAction] = useActionState(loginAction, { error: "" });

  return (
    <form action={formAction} className="p-6 w-96 space-y-3">
      <h1>Login</h1>

      {state.error && <p className="text-red-600">{state.error}</p>}

      <input name="email" type="email" className="border p-2 w-full" required />
      <input
        name="password"
        type="password"
        className="border p-2 w-full"
        required
      />

      <button className="bg-black text-white p-2 w-full">Login</button>
    </form>
  );
}
