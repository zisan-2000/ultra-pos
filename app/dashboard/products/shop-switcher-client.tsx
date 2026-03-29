// app/dashboard/products/shop-switcher-client.tsx

"use client";

import { ShopSwitcher } from "@/components/shop/shop-switcher";
import { useCurrentShop } from "@/hooks/use-current-shop";
import { useRouter } from "next/navigation";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { getOfflineRouteFallbackHref } from "@/lib/offline/route-readiness";

type Shop = {
  id: string;
  name: string;
};

type ProductStatusFilter = "all" | "active" | "inactive";

type Props = {
  shops: Shop[];
  activeShopId: string;
  query?: string;
  status?: ProductStatusFilter;
};

export function ShopSwitcherClient({
  shops,
  activeShopId,
  query,
  status = "all",
}: Props) {
  const router = useRouter();
  const online = useOnlineStatus();
  const { shopId, setShop } = useCurrentShop();

  const currentId = shopId || activeShopId || shops[0].id;

  function handleChange(id: string) {
    setShop(id);
    // Persist globally selected shop
    document.cookie = `activeShopId=${id}; path=/; max-age=${60 * 60 * 24 * 30}`;
    const params = new URLSearchParams({ shopId: id });
    if (query) params.set("q", query);
    if (status !== "all") params.set("status", status);
    const href = `/dashboard/products?${params.toString()}`;
    if (!online) {
      window.location.assign(getOfflineRouteFallbackHref(href));
      return;
    }
    router.push(href);
  }

  return (
    <ShopSwitcher
      shops={shops}
      activeShopId={currentId}
      onChange={handleChange}
    />
  );
}
