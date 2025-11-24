// app/dashboard/products/shop-switcher-client.tsx

"use client";

import { ShopSwitcher } from "@/components/shop/shop-switcher";
import { useCurrentShop } from "@/hooks/use-current-shop";
import { useRouter } from "next/navigation";

type Shop = {
  id: string;
  name: string;
};

export function ShopSwitcherClient({ shops }: { shops: Shop[] }) {
  const router = useRouter();
  const { shopId, setShop } = useCurrentShop();

  const currentId = shopId || shops[0].id;

  function handleChange(id: string) {
    setShop(id);
    router.refresh(); // reload current server component with new shop
  }

  return (
    <ShopSwitcher
      shops={shops}
      activeShopId={currentId}
      onChange={handleChange}
    />
  );
}
