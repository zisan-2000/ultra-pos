// lib/dexie/db.ts
import Dexie, { Table } from "dexie";

// --------------------------
// TYPES
// --------------------------
export type LocalProduct = {
  id: string;
  shopId: string;
  name: string;
  category: string;
  baseUnit?: string;
  displayUnit?: string | null;
  conversion?: string;
  buyPrice?: string | null;
  sellPrice: string;
  stockQty: string;
  isActive: boolean;
  updatedAt: number; // timestamp for sync
  syncStatus: "new" | "updated" | "deleted" | "synced";
};

export type LocalSale = {
  tempId: string; // local-only ID
  shopId: string;
  items: any[];
  paymentMethod: string;
  customerId?: string | null;
  note: string;
  totalAmount: string;
  createdAt: number;
  syncStatus: "new";
};

// Sync queue (generic)
export type SyncQueueItem = {
  id?: number;
  type: "product" | "sale";
  action: "create" | "update" | "delete";
  payload: any;
  createdAt: number;
  retryCount: number;
};

// --------------------------
// DEXIE DB
// --------------------------
export class PosDexieDB extends Dexie {
  // tables
  products!: Table<LocalProduct, string>;
  sales!: Table<LocalSale, string>;
  queue!: Table<SyncQueueItem, number>;

  constructor() {
    super("PosOfflineDB");

    this.version(1).stores({
      products: "id, shopId, syncStatus",
      sales: "tempId, shopId, syncStatus",
      queue: "++id, type, action",
    });
  }
}

export const db = new PosDexieDB();
