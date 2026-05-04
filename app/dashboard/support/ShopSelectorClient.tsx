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

  return (
    <Select
      value={selectedShopId}
      onValueChange={(id) => {
        setShop(id);
        document.cookie = `activeShopId=${id}; path=/; max-age=${60 * 60 * 24 * 30}`;
        router.push(`/dashboard/support?shopId=${id}`);
      }}
    >
      <SelectTrigger className="h-10 w-full sm:w-[200px] border border-border bg-card text-left text-foreground shadow-sm">
        <SelectValue placeholder="দোকান সিলেক্ট করুন" />
      </SelectTrigger>
      <SelectContent align="start" className="min-w-[var(--radix-select-trigger-width)]">
        {shops.map((shop) => (
          <SelectItem key={shop.id} value={shop.id}>
            {shop.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
