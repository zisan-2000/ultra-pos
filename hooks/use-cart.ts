// hooks/use-cart.ts
import { create } from "zustand";

export type CartItem = {
  itemKey: string;
  shopId: string;
  productId: string;
  variantId?: string | null;
  variantLabel?: string | null;
  name: string;
  unitPrice: number;
  originalPrice: number;
  qty: number;
  total: number;
  baseUnit?: string | null;
  trackSerialNumbers?: boolean | null;
  serialNumbers?: string[] | null;
};

type CartState = {
  currentShopId: string | null;
  items: CartItem[];
  setShop: (shopId: string) => void;
  add: (item: {
    itemKey: string;
    shopId: string;
    productId: string;
    variantId?: string | null;
    variantLabel?: string | null;
    name: string;
    unitPrice: number;
    baseUnit?: string | null;
    trackSerialNumbers?: boolean | null;
    qty?: number;
  }) => void;
  remove: (itemKey: string) => void;
  increase: (itemKey: string) => void;
  decrease: (itemKey: string) => void;
  updatePrice: (itemKey: string, newPrice: number) => void;
  updateQty: (itemKey: string, newQty: number) => void;
  setSerialNumbers: (itemKey: string, serials: string[]) => void;
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
    const nextQty = Math.max(1, Number(item.qty || 1));

    // If shop changed (or not set yet), reset cart to this shop before adding
    if (!currentShopId || currentShopId !== item.shopId) {
      return set({
        currentShopId: item.shopId,
        items: [
          {
            ...item,
            qty: nextQty,
            originalPrice: item.unitPrice,
            total: nextQty * item.unitPrice,
          },
        ],
      });
    }

    const existing = items.find((i) => i.itemKey === item.itemKey);

    if (existing) {
      return set({
        items: items.map((i) =>
          i.itemKey === item.itemKey
            ? {
                ...i,
                qty: i.qty + nextQty,
                total: (i.qty + nextQty) * i.unitPrice,
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
          qty: nextQty,
          originalPrice: item.unitPrice,
          total: nextQty * item.unitPrice,
        },
      ],
    });
  },

  remove: (itemKey) =>
    set({
      items: get().items.filter((i) => i.itemKey !== itemKey),
    }),

  increase: (itemKey) =>
    set({
      items: get().items.map((i) =>
        i.itemKey === itemKey
          ? {
              ...i,
              qty: i.qty + 1,
              total: (i.qty + 1) * i.unitPrice,
            }
          : i
      ),
    }),

  decrease: (itemKey) =>
    set({
      items: get()
        .items.map((i) =>
          i.itemKey === itemKey
            ? {
                ...i,
                qty: i.qty - 1,
                total: (i.qty - 1) * i.unitPrice,
              }
            : i
        )
        .filter((i) => i.qty > 0),
    }),

  updatePrice: (itemKey, newPrice) => {
    const price = Math.max(0, newPrice);
    if (price <= 0) return;
    set({
      items: get().items.map((i) =>
        i.itemKey === itemKey
          ? { ...i, unitPrice: price, total: i.qty * price }
          : i
      ),
    });
  },

  updateQty: (itemKey, newQty) => {
    const qty = Math.max(0, newQty);
    if (qty === 0) {
      set({ items: get().items.filter((i) => i.itemKey !== itemKey) });
    } else {
      set({
        items: get().items.map((i) =>
          i.itemKey === itemKey
            ? { ...i, qty, total: qty * i.unitPrice }
            : i
        ),
      });
    }
  },

  setSerialNumbers: (itemKey, serials) =>
    set({
      items: get().items.map((i) =>
        i.itemKey === itemKey ? { ...i, serialNumbers: serials } : i
      ),
    }),

  clear: () => set({ items: [] }),

  totalAmount: () => get().items.reduce((sum, i) => sum + i.total, 0),
}));
