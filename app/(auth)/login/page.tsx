// app/(auth)/login/page.tsx
"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error } = await authClient.signIn.email({
      email,
      password,
      fetchOptions: { credentials: "include" },
    });

    setLoading(false);

    if (error) {
      setError(error.message ?? "Login failed");
      return;
    }

    // Check if user is authenticated
    if (!data?.user) {
      setError("Login failed");
      return;
    }

    // Redirect to dashboard
    router.push("/dashboard");
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background px-4">
      <form
        onSubmit={handleSubmit}
        className="p-6 w-full max-w-md border border-border rounded-2xl space-y-4 bg-card shadow-sm"
      >
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold text-foreground">লগইন</h1>
          <p className="text-sm text-muted-foreground">
            আপনার ইমেইল ও পাসওয়ার্ড দিয়ে সাইন ইন করুন
          </p>
        </div>

        <div className="space-y-2">
          <input
            className="border border-border px-3 py-2 w-full rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <div className="relative">
            <input
              className="border border-border px-3 py-2 w-full rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 pr-12"
              placeholder="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              className="absolute inset-y-0 right-2 px-2 text-base text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <span aria-hidden="true">{showPassword ? "🙈" : "👁"}</span>
              <span className="sr-only">{showPassword ? "Hide" : "Show"}</span>
            </button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-lg p-2">
            {error}
          </p>
        )}

        <button
          className="bg-primary-soft text-primary border border-primary/30 p-2.5 w-full rounded-lg font-semibold hover:bg-primary/15 hover:border-primary/40 disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Signing in..." : "Login"}
        </button>

        <div className="flex items-center justify-between text-sm text-primary">
          <Link href="/forgot-password" className="hover:underline hover:text-primary-hover">
            পাসওয়ার্ড ভুলে গেছেন?
          </Link>
          <Link href="/register" className="hover:underline hover:text-primary-hover">
            নতুন অ্যাকাউন্ট
          </Link>
        </div>
      </form>
    </div>
  );
}

