// hooks/use-current-shop.ts

import { create } from "zustand";
import { persist } from "zustand/middleware";

type CurrentShopState = {
  shopId: string | null;
  setShop: (id: string) => void;
  clearShop: () => void;
};

export const useCurrentShop = create<CurrentShopState>()(
  persist(
    (set) => ({
      shopId: null,
      setShop: (id) => set({ shopId: id }),
      clearShop: () => set({ shopId: null }),
    }),
    {
      name: "pos-current-shop",
    }
  )
);
