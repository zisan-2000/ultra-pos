"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOnlineStatus } from "@/lib/sync/net-status";

const OFFLINE_ALLOWED_PREFIXES = [
  "/offline",
  "/login",
  "/dashboard/sales",
  "/dashboard/products",
  "/dashboard/expenses",
  "/dashboard/cash",
  "/dashboard/due",
  "/owner/dashboard",
  "/admin/dashboard",
  "/agent/dashboard",
  "/super-admin/dashboard",
];

const isAllowedOffline = (path: string) => {
  if (path === "/dashboard") return true;
  return OFFLINE_ALLOWED_PREFIXES.some((prefix) =>
    path === prefix || path.startsWith(`${prefix}/`)
  );
};

export default function OfflineCapabilityGuard() {
  const online = useOnlineStatus();
  const pathname = usePathname();

  if (online) return null;
  if (!pathname || isAllowedOffline(pathname)) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-6">
      <div className="max-w-lg rounded-2xl border border-border bg-card p-6 text-center shadow-lg">
        <h2 className="text-lg font-semibold text-foreground">
          Offline mode is limited
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This section needs an internet connection. Please go to an offline-capable
          area or reconnect.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/offline"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-muted px-4 text-sm font-semibold text-foreground hover:bg-muted/80"
          >
            Offline Page
          </Link>
          <Link
            href="/dashboard/sales"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-primary/30 bg-primary-soft px-4 text-sm font-semibold text-primary hover:bg-primary/10"
          >
            Go to POS
          </Link>
        </div>
      </div>
    </div>
  );
}
