"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { LogIn } from "lucide-react";

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

    if (error || !data?.user) {
      setError("ইমেইল বা পাসওয়ার্ড ঠিক হয়নি");
      return;
    }

    router.push("/dashboard");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-linear-to-br from-amber-50/70 via-white to-emerald-50/70 px-4">
      {/* soft background */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 right-[-10%] h-[420px] w-[420px] rounded-full bg-emerald-200/30 blur-[120px]" />
        <div className="absolute bottom-[-20%] left-[-10%] h-[420px] w-[420px] rounded-full bg-amber-200/40 blur-[120px]" />
      </div>

      <section className="relative mx-auto flex min-h-screen max-w-md items-center">
        <form
          onSubmit={handleSubmit}
          className="w-full space-y-7 rounded-3xl border border-white/70 bg-white/80 p-8 shadow-xl backdrop-blur"
        >
          {/* header (Version 2 copy) */}
          <div className="space-y-3 text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white/80 px-5 py-2 text-xs font-medium text-emerald-700 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              এখানে তাড়াহুড়া নেই
            </div>

            <h1 className="text-2xl font-semibold leading-snug text-slate-900">
              ব্যবসা মানেই শুধু কাজ নয়,
              <span className="block">এটাও তো আপনার একটা স্বপ্ন</span>
            </h1>

            <p className="text-sm leading-relaxed text-slate-500">
              সেই স্বপ্নটা যেন প্রতিদিন
              <br />
              হিসাব আর ঝামেলায় ক্লান্ত না হয়ে পড়ে—
              <br />
              আমরা সেটার খেয়াল রাখি।
            </p>
          </div>

          {/* inputs */}
          <div className="space-y-3">
            <input
              className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              placeholder="আপনার ইমেইল"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <div className="relative">
              <input
                className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                placeholder="পাসওয়ার্ড"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="absolute inset-y-0 right-3 text-lg text-slate-400 hover:text-slate-600"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          {/* error */}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* button (Version 2 copy) */}
          <button
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-3 font-semibold text-white shadow-lg shadow-emerald-200/70 hover:bg-emerald-700 disabled:opacity-60"
          >
            {loading ? (
              "ঢুকছি..."
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                লগইন করি
              </>
            )}
          </button>

          {/* only forgot password (no register) */}
          <div className="text-center">
            <Link
              href="/forgot-password"
              className="text-sm text-emerald-700 hover:underline"
            >
              পাসওয়ার্ড মনে পড়ছে না?
            </Link>
          </div>

          {/* trust line */}
          <p className="pt-4 text-center text-xs text-slate-400">
            শান্ত • নিরাপদ • আপনার মতো ব্যবসার জন্য
          </p>
        </form>
      </section>
    </main>
  );
}
