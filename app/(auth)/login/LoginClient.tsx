"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { LogIn } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

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
    <main className="relative min-h-screen overflow-hidden bg-linear-to-br from-primary-soft/40 via-background to-warning-soft/30 px-4">
      {/* soft background */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 right-[-10%] h-[420px] w-[420px] rounded-full bg-primary/15 blur-[120px]" />
        <div className="absolute bottom-[-20%] left-[-10%] h-[420px] w-[420px] rounded-full bg-warning/15 blur-[120px]" />
      </div>

      <div className="absolute right-6 top-6 z-10">
        <ThemeToggle />
      </div>

      <section className="relative mx-auto flex min-h-screen max-w-md items-center">
        <form
          onSubmit={handleSubmit}
          className="w-full space-y-7 rounded-3xl border border-border/60 bg-card/80 p-8 shadow-xl backdrop-blur"
        >
          {/* header (Version 2 copy) */}
          <div className="space-y-3 text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/15 bg-card/80 px-5 py-2 text-xs font-medium text-primary shadow-sm">
              <span className="h-2 w-2 rounded-full bg-primary" />
              এখানে তাড়াহুড়া নেই
            </div>

            <h1 className="text-2xl font-semibold leading-snug text-foreground">
              ব্যবসা মানেই শুধু কাজ নয়,
              <span className="block text-primary">এটাও তো আপনার একটা স্বপ্ন</span>
            </h1>

            <p className="text-sm leading-relaxed text-muted-foreground">
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
              className="w-full rounded-xl border border-border bg-card/80 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="আপনার ইমেইল"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <div className="relative">
              <input
                className="w-full rounded-xl border border-border bg-card/80 px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="পাসওয়ার্ড"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="absolute inset-y-0 right-3 text-lg text-muted-foreground hover:text-foreground/70"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          {/* error */}
          {error && (
            <div className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          {/* button (Version 2 copy) */}
          <button
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-lg hover:bg-primary-hover disabled:opacity-60"
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
            <a
              href="/forgot-password"
              className="text-sm text-primary hover:text-primary-hover hover:underline"
            >
              পাসওয়ার্ড মনে পড়ছে না?
            </a>
          </div>

          {/* trust line */}
          <p className="pt-4 text-center text-xs text-muted-foreground">
            শান্ত • নিরাপদ • আপনার মতো ব্যবসার জন্য
          </p>
        </form>
      </section>
    </main>
  );
}


