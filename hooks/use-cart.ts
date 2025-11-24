// hooks/use-cart.ts
import { create } from "zustand";

export type CartItem = {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
  total: number;
};

type CartState = {
  items: CartItem[];
  add: (item: { productId: string; name: string; unitPrice: number }) => void;
  remove: (productId: string) => void;
  increase: (productId: string) => void;
  decrease: (productId: string) => void;
  clear: () => void;
  totalAmount: () => number;
};

export const useCart = create<CartState>((set, get) => ({
  items: [],

  add: (item) => {
    const existing = get().items.find((i) => i.productId === item.productId);

    if (existing) {
      return set({
        items: get().items.map((i) =>
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
        ...get().items,
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
