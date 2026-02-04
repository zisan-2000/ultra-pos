// app/dashboard/reports/ShopSelectorClient.tsx

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
};

export default function ShopSelectorClient({ shops, selectedShopId }: Props) {
  const router = useRouter();
  const { setShop } = useCurrentShop();

  const handleChange = (id: string) => {
    // Persist globally selected shop
    setShop(id);
    document.cookie = `activeShopId=${id}; path=/; max-age=${60 * 60 * 24 * 30}`;
    router.push(`/dashboard/reports?shopId=${id}`);
  };

  return (
    <Select value={selectedShopId} onValueChange={handleChange}>
      <SelectTrigger className="h-11 w-full sm:w-[240px] border border-border bg-card text-left text-foreground shadow-sm focus:ring-2 focus:ring-primary/30">
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
  );
}
