"use client";

import { useActionState } from "react";
import { registerAction } from "@/app/actions/auth";

export default function RegisterPage() {
  const [state, formAction] = useActionState(registerAction, { error: "" });

  return (
    <form action={formAction} className="p-6 w-96 space-y-3">
      <h1>Register</h1>

      {state.error && <p className="text-red-600">{state.error}</p>}

      <input name="name" className="border p-2 w-full" required />
      <input name="email" type="email" className="border p-2 w-full" required />
      <input
        name="password"
        type="password"
        className="border p-2 w-full"
        required
      />

      <button className="bg-black text-white p-2 w-full">Register</button>
    </form>
  );
}
