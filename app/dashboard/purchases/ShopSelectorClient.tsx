// app/dashboard/purchases/ShopSelectorClient.tsx

"use client";

import { useRouter } from "next/navigation";
import { useCurrentShop } from "@/hooks/use-current-shop";
import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Shop = { id: string; name: string };

type Props = {
  shops: Shop[];
  selectedShopId: string;
};

export default function ShopSelectorClient({ shops, selectedShopId }: Props) {
  const router = useRouter();
  const { setShop } = useCurrentShop();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSelect = (id: string) => {
    setShop(id);
    document.cookie = `activeShopId=${id}; path=/; max-age=${60 * 60 * 24 * 30}`;
    router.push(`/dashboard/purchases?shopId=${id}`);
  };

  return mounted ? (
    <Select value={selectedShopId} onValueChange={handleSelect}>
      <SelectTrigger className="h-11 w-full sm:w-[220px] border border-border bg-card text-left text-foreground shadow-sm focus:ring-2 focus:ring-primary/30">
        <SelectValue placeholder="দোকান সিলেক্ট করুন" />
      </SelectTrigger>
      <SelectContent
        align="start"
        className="min-w-[var(--radix-select-trigger-width)]"
      >
        {shops.map((shop) => (
          <SelectItem key={shop.id} value={shop.id}>
            {shop.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ) : (
    <select
      className="h-11 w-full sm:w-[220px] border border-border bg-card px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      value={selectedShopId}
      onChange={(e) => handleSelect(e.target.value)}
    >
      {shops.map((shop) => (
        <option key={shop.id} value={shop.id}>
          {shop.name}
        </option>
      ))}
    </select>
  );
}
