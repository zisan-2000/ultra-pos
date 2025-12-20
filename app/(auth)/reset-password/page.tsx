// app/(auth)/reset-password/page.tsx
"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type ApiResponse = { success: boolean; error?: string };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="p-4 text-center">Loading...</div>}>
      <ResetPasswordPageInner />
    </Suspense>
  );
}

function ResetPasswordPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setMessage("লিঙ্কটি অবৈধ বা মেয়াদোত্তীর্ণ");
    }
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (password !== confirm) {
      setMessage("নতুন পাসওয়ার্ড ও কনফার্ম পাসওয়ার্ড মিলছে না");
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data: ApiResponse = await res.json();

      if (data.success) {
        setSuccess(true);
        setMessage("পাসওয়ার্ড সফলভাবে রিসেট হয়েছে। এখন লগইন করুন।");
        setPassword("");
        setConfirm("");
        setTimeout(() => router.push("/login"), 1200);
      } else {
        setMessage(data.error || "পাসওয়ার্ড রিসেট ব্যর্থ হয়েছে");
      }
    } catch {
      setMessage("পাসওয়ার্ড রিসেট ব্যর্থ হয়েছে");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold text-slate-900">নতুন পাসওয়ার্ড</h1>
          <p className="text-sm text-gray-600">
            লিঙ্কটি বৈধ হলে আপনার নতুন পাসওয়ার্ড সেট করুন।
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              নতুন পাসওয়ার্ড
            </label>
            <input
              type="password"
              required
              minLength={8}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="কমপক্ষে ৮ অক্ষর"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              কনফার্ম পাসওয়ার্ড
            </label>
            <input
              type="password"
              required
              minLength={8}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="আবার লিখুন"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !token}
            className="w-full bg-emerald-600 text-white rounded-lg py-2.5 font-semibold text-sm hover:bg-emerald-700 disabled:opacity-60 transition"
          >
            {loading ? "সংরক্ষণ হচ্ছে..." : "পাসওয়ার্ড রিসেট করুন"}
          </button>
        </form>

        {message ? (
          <div
            className={`text-sm rounded-lg p-3 border ${
              success
                ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                : "text-red-700 bg-red-50 border-red-200"
            }`}
          >
            {message}
          </div>
        ) : null}

        <div className="flex items-center justify-between text-sm text-blue-600">
          <Link href="/login" className="hover:underline">
            লগইন পাতায় ফিরে যান
          </Link>
          <Link href="/forgot-password" className="hover:underline">
            নতুন লিঙ্ক পাঠান
          </Link>
        </div>
      </div>
    </div>
  );
}
