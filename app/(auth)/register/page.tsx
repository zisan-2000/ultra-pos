// app/(auth)/register/page.tsx
"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await authClient.signUp.email({
      name,
      email,
      password,
      fetchOptions: { credentials: "include" },
    });

    setLoading(false);

    if (error) {
      setError(error.message ?? "Registration failed");
      return;
    }

    alert("Account created! Now login.");
    router.push("/login");
  }

  return (
    <div className="flex items-center justify-center h-screen">
      <form
        onSubmit={handleSubmit}
        className="p-6 w-96 border rounded space-y-3"
      >
        <h1 className="text-xl font-bold">Register</h1>

        <input
          className="border p-2 w-full"
          placeholder="Full Name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <input
          className="border p-2 w-full"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          className="border p-2 w-full"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          className="bg-black text-white p-2 w-full disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Creating..." : "Register"}
        </button>
      </form>
    </div>
  );
}
