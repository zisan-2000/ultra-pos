"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useOnlineStatus } from "@/lib/sync/net-status";
import {
  getOfflineProfileExpiryLabel,
  getRememberedOfflineProfile,
  hasConfiguredOfflinePin,
  isOfflineUnlocked,
  verifyOfflinePin,
  type OfflineRememberedProfile,
} from "@/lib/offline-auth";

export default function OfflineUnlockGuard() {
  const online = useOnlineStatus();
  const [profile, setProfile] = useState<OfflineRememberedProfile | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    if (online) {
      setUnlocked(false);
      setProfile(null);
      setPin("");
      setError(null);
      return;
    }
    const nextProfile = getRememberedOfflineProfile();
    setProfile(nextProfile);
    setUnlocked(isOfflineUnlocked());
    setError(null);
  }, [online]);

  const hasPin = hasConfiguredOfflinePin(profile);
  const expiryLabel = useMemo(
    () => getOfflineProfileExpiryLabel(profile),
    [profile]
  );

  if (online || unlocked) return null;

  const handleUnlock = async () => {
    try {
      setUnlocking(true);
      setError(null);
      await verifyOfflinePin(pin);
      setUnlocked(true);
      setPin("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Offline unlock failed");
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background/92 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-[0_24px_64px_rgba(15,23,42,0.22)]">
        <div className="space-y-2 text-center">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary-soft text-xl text-primary">
            🔐
          </div>
          <h2 className="text-xl font-bold text-foreground">
            Offline Unlock দরকার
          </h2>
          <p className="text-sm text-muted-foreground">
            ইন্টারনেট নেই। এই ডিভাইসে আগে লগইন করা user হলে PIN দিয়ে offline
            mode চালু করতে পারবেন।
          </p>
        </div>

        {!profile ? (
          <div className="mt-5 rounded-2xl border border-warning/30 bg-warning-soft/40 p-4 text-sm text-warning">
            এই ডিভাইসে কোনো remembered offline session নেই। প্রথমবার internet
            নিয়ে login করতে হবে।
          </div>
        ) : !hasPin ? (
          <div className="mt-5 rounded-2xl border border-warning/30 bg-warning-soft/40 p-4 text-sm text-warning">
            <p>
              <span className="font-semibold text-foreground">
                {profile.name || profile.email || "এই user"}
              </span>
              {" "}এর জন্য offline PIN এখনো সেট করা হয়নি।
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              আগে online login করে PIN সেট করতে হবে।
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm">
              <p className="font-semibold text-foreground">
                {profile.name || "পরিচিত ব্যবহারকারী"}
              </p>
              <p className="text-muted-foreground">{profile.email || "ইমেইল নেই"}</p>
              {expiryLabel ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Offline access valid until: {expiryLabel}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                Offline PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-center text-lg tracking-[0.35em] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                placeholder="••••"
              />
              {error ? (
                <p className="text-sm text-danger">{error}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  ৪ থেকে ৬ সংখ্যার PIN দিন।
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleUnlock}
              disabled={unlocking || pin.length < 4}
              className="h-12 w-full rounded-2xl bg-primary text-primary-foreground font-semibold shadow-sm disabled:opacity-60"
            >
              {unlocking ? "Unlock হচ্ছে..." : "Offline Unlock"}
            </button>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link
            href="/login"
            className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl border border-border bg-muted px-4 text-sm font-semibold text-foreground hover:bg-muted/80"
          >
            Login Page
          </Link>
          <Link
            href="/offline"
            className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl border border-primary/30 bg-primary-soft px-4 text-sm font-semibold text-primary hover:bg-primary/10"
          >
            Offline Info
          </Link>
        </div>
      </div>
    </div>
  );
}
