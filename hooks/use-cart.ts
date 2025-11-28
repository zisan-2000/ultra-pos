// hooks/use-cart.ts
import { create } from "zustand";

export type CartItem = {
  shopId: string;
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
  total: number;
};

type CartState = {
  currentShopId: string | null;
  items: CartItem[];
  setShop: (shopId: string) => void;
  add: (item: { shopId: string; productId: string; name: string; unitPrice: number }) => void;
  remove: (productId: string) => void;
  increase: (productId: string) => void;
  decrease: (productId: string) => void;
  clear: () => void;
  totalAmount: () => number;
};

export const useCart = create<CartState>((set, get) => ({
  currentShopId: null,
  items: [],

  setShop: (shopId) =>
    set((state) =>
      state.currentShopId === shopId
        ? state
        : {
            currentShopId: shopId,
            items: [], // reset cart when switching shops
          }
    ),

  add: (item) => {
    const { currentShopId, items } = get();

    // If shop changed (or not set yet), reset cart to this shop before adding
    if (!currentShopId || currentShopId !== item.shopId) {
      return set({
        currentShopId: item.shopId,
        items: [
          {
            ...item,
            qty: 1,
            total: item.unitPrice,
          },
        ],
      });
    }

    const existing = items.find((i) => i.productId === item.productId);

    if (existing) {
      return set({
        items: items.map((i) =>
          i.productId === item.productId
            ? {
                ...i,
                qty: i.qty + 1,
                total: (i.qty + 1) * i.unitPrice,
              }
            : i
        ),
      });
    }

    set({
      items: [
        ...items,
        {
          ...item,
          qty: 1,
          total: item.unitPrice,
        },
      ],
    });
  },

  remove: (productId) =>
    set({
      items: get().items.filter((i) => i.productId !== productId),
    }),

  increase: (productId) =>
    set({
      items: get().items.map((i) =>
        i.productId === productId
          ? {
              ...i,
              qty: i.qty + 1,
              total: (i.qty + 1) * i.unitPrice,
            }
          : i
      ),
    }),

  decrease: (productId) =>
    set({
      items: get()
        .items.map((i) =>
          i.productId === productId
            ? {
                ...i,
                qty: i.qty - 1,
                total: (i.qty - 1) * i.unitPrice,
              }
            : i
        )
        .filter((i) => i.qty > 0),
    }),

  clear: () => set({ items: [] }),

  totalAmount: () => get().items.reduce((sum, i) => sum + i.total, 0),
}));
