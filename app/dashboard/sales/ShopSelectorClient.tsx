"use client";

import { useRouter } from "next/navigation";

type Shop = { id: string; name: string };

type Props = {
  shops: Shop[];
  selectedShopId: string;
};

export default function ShopSelectorClient({ shops, selectedShopId }: Props) {
  const router = useRouter();

  return (
    <select
      className="border px-2 py-1"
      value={selectedShopId}
      onChange={(e) => {
        const id = e.target.value;
        router.push(`/dashboard/sales?shopId=${id}`);
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
