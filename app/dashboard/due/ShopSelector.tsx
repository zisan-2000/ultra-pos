"use client";

import { useRouter } from "next/navigation";
import { useCurrentShop } from "@/hooks/use-current-shop";

type Shop = { id: string; name: string };

type Props = {
  shops: Shop[];
  selectedShopId: string;
};

export default function DueShopSelector({ shops, selectedShopId }: Props) {
  const router = useRouter();
  const { setShop } = useCurrentShop();

  return (
    <select
      className="border px-3 py-2 rounded text-sm"
      value={selectedShopId}
      onChange={(e) => {
        const id = e.target.value;
        // Persist globally selected shop
        setShop(id);
        document.cookie = `activeShopId=${id}; path=/; max-age=${60 * 60 * 24 * 30}`;
        router.push(`/dashboard/due?shopId=${id}`);
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
