// app/(auth)/register/page.tsx
"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
    <div className="flex items-center justify-center min-h-screen bg-slate-50 px-4">
      <form
        onSubmit={handleSubmit}
        className="p-6 w-full max-w-md border border-slate-200 rounded-2xl space-y-4 bg-white shadow-sm"
      >
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold text-slate-900">নতুন অ্যাকাউন্ট</h1>
          <p className="text-sm text-gray-600">
            আপনার নাম, ইমেইল ও পাসওয়ার্ড দিয়ে সাইন আপ করুন
          </p>
        </div>

        <div className="space-y-2">
          <input
            className="border border-slate-200 px-3 py-2 w-full rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="পুরো নাম"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <input
            className="border border-slate-200 px-3 py-2 w-full rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            className="border border-slate-200 px-3 py-2 w-full rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
            {error}
          </p>
        )}

        <button
          className="bg-blue-600 text-white p-2.5 w-full rounded-lg font-semibold disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Creating..." : "Register"}
        </button>

        <div className="flex items-center justify-between text-sm text-blue-600">
          <Link href="/login" className="hover:underline">
            ইতিমধ্যেই অ্যাকাউন্ট আছে?
          </Link>
          <Link href="/forgot-password" className="hover:underline">
            পাসওয়ার্ড ভুলে গেছেন?
          </Link>
        </div>
      </form>
    </div>
  );
}
