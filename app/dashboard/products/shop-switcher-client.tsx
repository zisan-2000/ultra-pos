// app/dashboard/products/shop-switcher-client.tsx

"use client";

import { ShopSwitcher } from "@/components/shop/shop-switcher";
import { useCurrentShop } from "@/hooks/use-current-shop";
import { useRouter } from "next/navigation";

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
  const { shopId, setShop } = useCurrentShop();

  const currentId = shopId || activeShopId || shops[0].id;

  function handleChange(id: string) {
    setShop(id);
    // Persist globally selected shop
    document.cookie = `activeShopId=${id}; path=/; max-age=${60 * 60 * 24 * 30}`;
    const params = new URLSearchParams({ shopId: id });
    if (query) params.set("q", query);
    if (status !== "all") params.set("status", status);
    router.push(`/dashboard/products?${params.toString()}`);
  }

  return (
    <ShopSwitcher
      shops={shops}
      activeShopId={currentId}
      onChange={handleChange}
    />
  );
}
