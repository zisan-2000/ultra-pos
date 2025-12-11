// app/(auth)/forgot-password/page.tsx
"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

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
    <div className="flex items-center justify-center min-h-screen bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold text-slate-900">পাসওয়ার্ড রিসেট</h1>
          <p className="text-sm text-gray-600">
            আপনার একাউন্টের সাথে যুক্ত ইমেইল লিখুন। যদি ইমেইলটি থাকে, রিসেট লিঙ্ক
            পাঠানো হবে।
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">ইমেইল</label>
            <input
              type="email"
              required
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 font-semibold text-sm hover:bg-blue-700 disabled:opacity-60 transition"
          >
            {loading ? "পাঠানো হচ্ছে..." : "রিসেট লিঙ্ক পাঠান"}
          </button>
        </form>

        {message ? (
          <div className="text-sm text-gray-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
            {message}
          </div>
        ) : null}

        {devResetUrl ? (
          <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            ডেভ মোড লিঙ্ক:{" "}
            <Link className="underline font-semibold" href={devResetUrl}>
              {devResetUrl}
            </Link>
          </div>
        ) : null}

        <div className="flex items-center justify-between text-sm text-blue-600">
          <Link href="/login" className="hover:underline">
            লগইন পাতায় ফিরে যান
          </Link>
          <Link href="/register" className="hover:underline">
            নতুন একাউন্ট খুলুন
          </Link>
        </div>
      </div>
    </div>
  );
}
