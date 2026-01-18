"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCurrentShop } from "@/hooks/use-current-shop";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useSyncStatus } from "@/lib/sync/sync-status";

type Shop = { id: string; name: string };

type RbacUser = {
  id: string;
  email: string | null;
  name: string | null;
  roles: string[];
  permissions: string[];
} | null;

export default function PosShell({
  shops,
  initialUser: _initialUser,
  children,
}: {
  shops: Shop[];
  initialUser: RbacUser;
  children: ReactNode;
}) {
  const online = useOnlineStatus();
  const { pendingCount, syncing } = useSyncStatus();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { shopId, setShop } = useCurrentShop();
  const showSyncStatus = syncing || pendingCount > 0;

  const resolvedShopId = useMemo(() => {
    if (!shops || shops.length === 0) return null;
    const urlShopId = searchParams?.get("shopId");
    if (urlShopId && shops.some((s) => s.id === urlShopId)) return urlShopId;
    if (shopId && shops.some((s) => s.id === shopId)) return shopId;
    return shops[0]?.id ?? null;
  }, [shops, searchParams, shopId]);

  const currentShopName = useMemo(() => {
    if (!resolvedShopId) return "Unknown shop";
    return shops.find((s) => s.id === resolvedShopId)?.name || "Unknown shop";
  }, [resolvedShopId, shops]);

  useEffect(() => {
    if (!shops || shops.length === 0) return;
    const urlShopId = searchParams?.get("shopId");
    if (!urlShopId) return;
    if (!shops.some((s) => s.id === urlShopId)) return;

    if (urlShopId !== shopId) {
      setShop(urlShopId);
      document.cookie = `activeShopId=${urlShopId}; path=/; max-age=${
        60 * 60 * 24 * 30
      }`;
    }
  }, [searchParams, shops, shopId, setShop]);

  useEffect(() => {
    if (resolvedShopId && resolvedShopId !== shopId) {
      setShop(resolvedShopId);
    }
  }, [resolvedShopId, shopId, setShop]);

  const handleShopChange = (id: string) => {
    if (!id) return;
    setShop(id);
    document.cookie = `activeShopId=${id}; path=/; max-age=${
      60 * 60 * 24 * 30
    }`;

    const params = new URLSearchParams(searchParams?.toString() || "");
    params.set("shopId", id);
    const next = `${pathname}?${params.toString()}`;
    router.replace(next);
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-background">
      {shops.length > 0 ? (
        <header className="sticky top-0 z-20 bg-card/80 backdrop-blur border-b border-border">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 py-3">
            <div className="min-w-[180px]">
              <p className="text-base font-semibold text-foreground line-clamp-2">
                {currentShopName}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                aria-label="Select shop"
                className="border border-border rounded-md bg-card px-3 py-2 text-sm text-foreground"
                value={resolvedShopId ?? ""}
                onChange={(event) => handleShopChange(event.target.value)}
              >
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}
                  </option>
                ))}
              </select>

              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  online
                    ? "bg-success-soft text-success"
                    : "bg-danger-soft text-danger"
                }`}
              >
                {online ? "Online" : "Offline"}
              </span>
              {showSyncStatus && (
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    syncing
                      ? "bg-primary-soft text-primary"
                      : "bg-warning-soft text-warning"
                  }`}
                >
                  {syncing ? "Syncing..." : `Pending ${pendingCount}`}
                </span>
              )}
            </div>
          </div>
        </header>
      ) : null}

      <main className="px-4 sm:px-6 lg:px-8 py-6 pb-28">{children}</main>
    </div>
  );
}
