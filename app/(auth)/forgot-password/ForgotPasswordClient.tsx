// app/(auth)/forgot-password/ForgotPasswordClient.tsx
"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

type ApiResponse = { success: boolean; resetUrl?: string; error?: string };

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setDevResetUrl(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data: ApiResponse = await res.json();
      if (data.success) {
        setMessage(
          "যদি ইমেইলটি সিস্টেমে থাকে, একটি রিসেট লিঙ্ক পাঠানো হয়েছে। ইনবক্স বা স্প্যাম ফোল্ডার চেক করুন।"
        );
        if (data.resetUrl) {
          setDevResetUrl(data.resetUrl);
        }
      } else {
        setMessage(
          data.error || "অনুরোধটি সম্পন্ন করা যাচ্ছে না, পরে আবার চেষ্টা করুন।"
        );
      }
    } catch {
      setMessage("অনুরোধ ব্যর্থ হয়েছে, পরে চেষ্টা করুন।");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex items-center justify-center min-h-screen bg-background px-4">
      <div className="absolute right-6 top-6 z-10">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-sm p-6 space-y-4">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold text-foreground">পাসওয়ার্ড রিসেট</h1>
          <p className="text-sm text-muted-foreground">
            আপনার একাউন্টের সাথে যুক্ত ইমেইল লিখুন। যদি ইমেইলটি থাকে, রিসেট লিঙ্ক
            পাঠানো হবে।
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">ইমেইল</label>
            <input
              type="email"
              required
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
          className="w-full bg-primary-soft text-primary border border-primary/30 rounded-lg py-2.5 font-semibold text-sm hover:bg-primary/15 hover:border-primary/40 disabled:opacity-60 transition"
          >
            {loading ? "পাঠানো হচ্ছে..." : "রিসেট লিঙ্ক পাঠান"}
          </button>
        </form>

        {message ? (
          <div className="text-sm text-muted-foreground bg-muted border border-border rounded-lg p-3">
            {message}
          </div>
        ) : null}

        {devResetUrl ? (
          <div className="text-xs text-success bg-success-soft border border-success/30 rounded-lg p-3">
            ডেভ মোড লিঙ্ক:{" "}
            <Link className="underline font-semibold" href={devResetUrl}>
              {devResetUrl}
            </Link>
          </div>
        ) : null}

        <div className="flex items-center justify-between text-sm text-primary">
          <Link href="/login" className="hover:underline hover:text-primary-hover">
            লগইন পাতায় ফিরে যান
          </Link>
          <Link href="/register" className="hover:underline hover:text-primary-hover">
            নতুন একাউন্ট খুলুন
          </Link>
        </div>
      </div>
    </div>
  );
}

