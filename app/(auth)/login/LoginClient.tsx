"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { LogIn } from "lucide-react";
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
        setError("ইমেইল বা পাসওয়ার্ড ঠিক হয়নি");
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
          ? "লগইন করা যায়নি। আবার চেষ্টা করুন।"
          : "Offline অবস্থায় নতুন login হবে না। পরিচিত device হলে offline continue ব্যবহার করুন।"
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
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Offline continue failed");
    } finally {
      setOfflineLoading(false);
    }
  }

  const offlineExpiry = getOfflineProfileExpiryLabel(offlineProfile);
  const canUseOfflineContinue = !online && offlineProfile;

  return (
    <main className="relative min-h-screen overflow-hidden bg-linear-to-br from-primary-soft/40 via-background to-warning-soft/30 px-4">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 right-[-10%] h-[420px] w-[420px] rounded-full bg-primary/15 blur-[120px]" />
        <div className="absolute bottom-[-20%] left-[-10%] h-[420px] w-[420px] rounded-full bg-warning/15 blur-[120px]" />
      </div>

      <div className="absolute right-6 top-6 z-10">
        <ThemeToggle />
      </div>

      <section className="relative mx-auto flex min-h-screen max-w-md items-center">
        <div className="w-full space-y-4">
          <form
            onSubmit={handleSubmit}
            className="w-full space-y-7 rounded-3xl border border-border/60 bg-card/80 p-8 shadow-xl backdrop-blur"
          >
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

            {error ? (
              <div className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-2 text-sm text-danger">
                {error}
              </div>
            ) : null}

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

            <div className="text-center">
              <a
                href="/forgot-password"
                className="text-sm text-primary hover:text-primary-hover hover:underline"
              >
                পাসওয়ার্ড মনে পড়ছে না?
              </a>
            </div>

            <p className="pt-4 text-center text-xs text-muted-foreground">
              শান্ত • নিরাপদ • আপনার মতো ব্যবসার জন্য
            </p>
          </form>

          {!online ? (
            <div className="rounded-3xl border border-border/60 bg-card/80 p-5 shadow-lg backdrop-blur">
              <div className="space-y-3">
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">
                    Offline mode
                  </p>
                  <p className="text-xs text-muted-foreground">
                    নতুন login internet ছাড়া হবে না। পরিচিত device/user হলে
                    offline continue ব্যবহার করুন।
                  </p>
                </div>

                {!offlineProfile ? (
                  <div className="rounded-2xl border border-warning/30 bg-warning-soft/40 p-4 text-sm text-warning">
                    এই ডিভাইসে কোনো remembered offline user নেই। আগে online
                    login করতে হবে।
                  </div>
                ) : canUseOfflineContinue ? (
                  <form onSubmit={handleOfflineContinue} className="space-y-3">
                    <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm">
                      <p className="font-semibold text-foreground">
                        {offlineProfile.name || "পরিচিত ব্যবহারকারী"}
                      </p>
                      <p className="text-muted-foreground">
                        {offlineProfile.email || "ইমেইল নেই"}
                      </p>
                      {offlineExpiry ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Valid until: {offlineExpiry}
                        </p>
                      ) : null}
                    </div>
                    <button
                      disabled={offlineLoading}
                      className="flex w-full items-center justify-center rounded-full bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-lg hover:bg-primary-hover disabled:opacity-60"
                    >
                      {offlineLoading ? "খুলছে..." : "Offline Continue"}
                    </button>
                  </form>
                ) : (
                  <div className="rounded-2xl border border-warning/30 bg-warning-soft/40 p-4 text-sm text-warning">
                    এই device-এ remembered offline access পাওয়া যায়নি। আগে
                    internet নিয়ে login করতে হবে।
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
