// components/shop/shop-switcher.tsx

"use client";

type Shop = {
  id: string;
  name: string;
};

export function ShopSwitcher({
  shops,
  activeShopId,
  onChange,
}: {
  shops: Shop[];
  activeShopId: string;
  onChange: (id: string) => void;
}) {
  return (
    <select
      className="border px-2 py-1"
      value={activeShopId}
      onChange={(e) => onChange(e.target.value)}
    >
      {shops.map((shop) => (
        <option key={shop.id} value={shop.id}>
          {shop.name}
        </option>
      ))}
    </select>
  );
}
