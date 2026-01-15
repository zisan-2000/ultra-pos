// components/shop/shop-switcher.tsx

"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    <Select value={activeShopId} onValueChange={onChange}>
      <SelectTrigger className="h-10 w-full sm:w-[220px] border border-border bg-card text-left text-foreground shadow-sm focus:ring-2 focus:ring-primary/30">
        <SelectValue placeholder="দোকান সিলেক্ট করুন" />
      </SelectTrigger>
      <SelectContent align="start" className="w-[240px]">
        {shops.map((shop) => (
          <SelectItem key={shop.id} value={shop.id}>
            {shop.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
