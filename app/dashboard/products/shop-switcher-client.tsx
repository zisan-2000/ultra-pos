// app/dashboard/products/shop-switcher-client.tsx

"use client";

import { ShopSwitcher } from "@/components/shop/shop-switcher";
import { useCurrentShop } from "@/hooks/use-current-shop";
import { useRouter } from "next/navigation";

type Shop = {
  id: string;
  name: string;
};

type Props = { shops: Shop[]; activeShopId: string };

export function ShopSwitcherClient({ shops, activeShopId }: Props) {
  const router = useRouter();
  const { shopId, setShop } = useCurrentShop();

  const currentId = shopId || activeShopId || shops[0].id;

  function handleChange(id: string) {
    setShop(id);
    router.push(`/dashboard/products?shopId=${id}`);
  }

  return (
    <ShopSwitcher
      shops={shops}
      activeShopId={currentId}
      onChange={handleChange}
    />
  );
}
