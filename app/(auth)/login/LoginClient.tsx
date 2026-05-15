"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Eye, EyeOff } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useOnlineStatus } from "@/lib/sync/net-status";
import {
  clearRememberedOfflineAuth,
  getOfflineProfileExpiryLabel,
  getRememberedOfflineProfile,
  isOfflineCapableUser,
  rememberOfflineUser,
  type OfflineAuthUser,
  type OfflineRememberedProfile,
} from "@/lib/offline-auth";
import { prepareOfflineForShop } from "@/lib/offline/prepare";

export default function LoginPage() {
  const router = useRouter();
  const online = useOnlineStatus();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [offlineProfile, setOfflineProfile] =
    useState<OfflineRememberedProfile | null>(null);
  const [offlineLoading, setOfflineLoading] = useState(false);

  useEffect(() => {
    setOfflineProfile(getRememberedOfflineProfile());
  }, []);

  async function fetchSessionRbacUser() {
    const res = await fetch("/api/auth/session-rbac", {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { user?: OfflineAuthUser | null };
    return json?.user ?? null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data, error } = await authClient.signIn.email({
        email,
        password,
        fetchOptions: { credentials: "include" },
      });

      if (error || !data?.user) {
        setError("ইমেইল বা পাসওয়ার্ড ঠিক হয়নি");
        return;
      }

      const sessionUser = await fetchSessionRbacUser();
      if (!sessionUser) {
        void prepareOfflineForShop(null, { runSync: false });
        router.push("/dashboard");
        return;
      }

      if (!isOfflineCapableUser(sessionUser)) {
        clearRememberedOfflineAuth();
        void prepareOfflineForShop(sessionUser.staffShopId ?? null, {
          runSync: false,
        });
        router.push("/dashboard");
        return;
      }

      const remembered = rememberOfflineUser(sessionUser);
      setOfflineProfile(remembered);
      void prepareOfflineForShop(sessionUser.staffShopId ?? null, {
        runSync: false,
      });
      router.push("/dashboard");
    } catch {
      setError(
        online
          ? "লগইন করা যায়নি। আবার চেষ্টা করুন।"
          : "Offline অবস্থায় নতুন login হবে না। পরিচিত device হলে offline continue ব্যবহার করুন।"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleOfflineContinue(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setOfflineLoading(true);
      router.push("/offline");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Offline continue failed");
    } finally {
      setOfflineLoading(false);
    }
  }

  const offlineExpiry = getOfflineProfileExpiryLabel(offlineProfile);
  const canUseOfflineContinue = !online && offlineProfile;

  return (
    <main className="relative min-h-dvh overflow-y-auto overflow-x-hidden bg-linear-to-br from-primary-soft/40 via-background to-warning-soft/30 px-4">
      {/* Background blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 right-[-10%] h-105 w-105 rounded-full bg-primary/15 blur-[120px]" />
        <div className="absolute bottom-[-20%] left-[-10%] h-105 w-105 rounded-full bg-warning/15 blur-[120px]" />
      </div>

      {/* Theme toggle */}
      <div className="absolute right-5 top-5 z-10">
        <ThemeToggle />
      </div>

      <section className="relative mx-auto flex min-h-dvh max-w-md items-center py-8">
        <div className="w-full space-y-4">
          {/* Card */}
          <div className="w-full overflow-hidden rounded-3xl border border-border/60 bg-card/90 shadow-[0_24px_64px_rgba(15,23,42,0.12)] backdrop-blur">
            {/* Card header strip */}
            <div className="border-b border-border/50 bg-muted/30 px-8 py-5">
              {/* Brand */}
              <div className="mb-4 flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-foreground">
                  Sell<span className="text-primary">Flick</span>
                </span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
                  বাংলাদেশ
                </span>
              </div>
              <h1 className="text-lg font-semibold text-foreground">আপনার অ্যাকাউন্টে লগইন করুন</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                আপনার ইমেইল ও পাসওয়ার্ড দিয়ে ঢুকুন
              </p>
            </div>

            {/* Form body */}
            <form onSubmit={handleSubmit} className="space-y-4 px-8 py-6">
              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="email">
                  ইমেইল
                </label>
                <input
                  id="email"
                  className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                  placeholder="example@gmail.com"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground" htmlFor="password">
                    পাসওয়ার্ড
                  </label>
                  <a
                    href="/forgot-password"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    পাসওয়ার্ড ভুলে গেছেন?
                  </a>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                    placeholder="আপনার পাসওয়ার্ড"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute inset-y-0 right-3 flex items-center px-1 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখুন"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4.5 w-4.5" />
                    ) : (
                      <Eye className="h-4.5 w-4.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error ? (
                <div className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
                  {error}
                </div>
              ) : null}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="mt-2 flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(22,163,74,0.3)] transition hover:bg-primary-hover active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? "লগইন হচ্ছে..." : "লগইন করুন"}
              </button>
            </form>
          </div>

          {/* Offline block */}
          {!online ? (
            <div className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow backdrop-blur">
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Offline mode</p>
                  <p className="text-xs text-muted-foreground">
                    নতুন login internet ছাড়া হবে না। পরিচিত device/user হলে offline continue ব্যবহার করুন।
                  </p>
                </div>

                {!offlineProfile ? (
                  <div className="rounded-xl border border-warning/30 bg-warning-soft/40 p-3 text-sm text-warning">
                    এই ডিভাইসে কোনো remembered offline user নেই। আগে online login করতে হবে।
                  </div>
                ) : canUseOfflineContinue ? (
                  <form onSubmit={handleOfflineContinue} className="space-y-3">
                    <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
                      <p className="font-semibold text-foreground">
                        {offlineProfile.name || "পরিচিত ব্যবহারকারী"}
                      </p>
                      <p className="text-muted-foreground">{offlineProfile.email || "ইমেইল নেই"}</p>
                      {offlineExpiry ? (
                        <p className="mt-1 text-xs text-muted-foreground">Valid until: {offlineExpiry}</p>
                      ) : null}
                    </div>
                    <button
                      type="submit"
                      disabled={offlineLoading}
                      className="flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-60"
                    >
                      {offlineLoading ? "খুলছে..." : "Offline Continue"}
                    </button>
                  </form>
                ) : (
                  <div className="rounded-xl border border-warning/30 bg-warning-soft/40 p-3 text-sm text-warning">
                    এই device-এ remembered offline access পাওয়া যায়নি। আগে internet নিয়ে login করতে হবে।
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
