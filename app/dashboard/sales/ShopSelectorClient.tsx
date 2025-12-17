// app/dashboard/sales/ShopSelectorClient.tsx

"use client";

import { useRouter } from "next/navigation";
import { useCurrentShop } from "@/hooks/use-current-shop";

type Shop = { id: string; name: string };

type Props = {
  shops: Shop[];
  selectedShopId: string;
  from?: string;
  to?: string;
};

export default function ShopSelectorClient({
  shops,
  selectedShopId,
  from,
  to,
}: Props) {
  const router = useRouter();
  const { setShop } = useCurrentShop();

  return (
    <select
      className="border px-2 py-1"
      value={selectedShopId}
      onChange={(e) => {
        const id = e.target.value;
        // Persist globally selected shop
        setShop(id);
        document.cookie = `activeShopId=${id}; path=/; max-age=${
          60 * 60 * 24 * 30
        }`;
        const params = new URLSearchParams({ shopId: id });
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        router.push(`/dashboard/sales?${params.toString()}`);
      }}
    >
      {shops.map((shop) => (
        <option key={shop.id} value={shop.id}>
          {shop.name}
        </option>
      ))}
    </select>
  );
}
