// app/dashboard/sales/ShopSelectorClient.tsx

"use client";

import { useRouter } from "next/navigation";
import { useCurrentShop } from "@/hooks/use-current-shop";
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
    <Select
      value={selectedShopId}
      onValueChange={(id) => {
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
      <SelectTrigger className="h-10 w-full sm:w-[200px] border border-border bg-card text-left text-foreground shadow-sm focus:ring-2 focus:ring-primary/30">
        <SelectValue placeholder="দোকান সিলেক্ট করুন" />
      </SelectTrigger>
      <SelectContent align="end" className="w-[220px]">
        {shops.map((shop) => (
          <SelectItem key={shop.id} value={shop.id}>
            {shop.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
