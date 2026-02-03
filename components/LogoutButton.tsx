// components/LogoutButton.tsx

"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { clearOfflineData } from "@/lib/offline/cleanup";

function SubmitButton({
  variant,
  pending,
  onClick,
}: {
  variant?: "default" | "menu";
  pending: boolean;
  onClick: () => void;
}) {
  const className =
    variant === "menu"
      ? "w-full px-3 py-2 rounded-lg bg-secondary text-secondary-foreground font-semibold text-sm hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      : "w-full px-4 py-3 rounded-lg bg-destructive text-white font-medium text-base hover:bg-destructive/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors";

  return (
    <button
      type="button"
      disabled={pending}
      data-testid="logout-button"
      className={className}
      onClick={onClick}
    >
      {pending ? "লগ আউট হচ্ছে..." : "লগ আউট"}
    </button>
  );
}

export default function LogoutButton({
  variant,
}: {
  variant?: "default" | "menu";
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await authClient.signOut({
        fetchOptions: { credentials: "include" },
      } as any);
    } catch (err) {
      setError("লগ আউট হয়নি, আবার চেষ্টা করুন");
    } finally {
      await clearOfflineData();
      window.location.assign("/login");
    }
  };

  return (
    <div className="flex items-center gap-2">
      <SubmitButton
        variant={variant}
        pending={pending}
        onClick={handleLogout}
      />
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}
