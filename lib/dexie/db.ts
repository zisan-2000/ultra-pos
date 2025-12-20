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
  trackStock?: boolean;
  businessType?: string;
  expiryDate?: string | null;
  size?: string | null;
  updatedAt: number; // timestamp for sync
  syncStatus: "new" | "updated" | "deleted" | "synced";
};

export type LocalSale = {
  tempId: string; // local-only ID; for server-seeded records we also store id
  id?: string;
  shopId: string;
  items: any[];
  paymentMethod: string;
  customerId?: string | null;
  note: string;
  totalAmount: string;
  createdAt: number;
  syncStatus: "new" | "synced";
  // Optional summary fields for offline listing
  itemCount?: number;
  itemPreview?: string;
  customerName?: string | null;
  status?: string | null;
  voidReason?: string | null;
};

export type LocalExpense = {
  id: string;
  shopId: string;
  amount: string;
  category: string;
  note?: string | null;
  expenseDate: string;
  createdAt: number;
  syncStatus: "new" | "updated" | "deleted" | "synced";
};

export type LocalCashEntry = {
  id: string;
  shopId: string;
  entryType: "IN" | "OUT";
  amount: string;
  reason?: string | null;
  createdAt: number;
  syncStatus: "new" | "updated" | "deleted" | "synced";
};

// Sync queue (generic)
export type SyncQueueItem = {
  id?: number;
  type:
    | "product"
    | "sale"
    | "expense"
    | "cash"
    | "due_customer"
    | "due_payment";
  action: "create" | "update" | "delete" | "payment";
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
  expenses!: Table<LocalExpense, string>;
  cash!: Table<LocalCashEntry, string>;
  queue!: Table<SyncQueueItem, number>;

  constructor() {
    super("PosOfflineDB");

    // v1: initial schema
    this.version(1).stores({
      products: "id, shopId, syncStatus",
      sales: "tempId, shopId, syncStatus",
      queue: "++id, type, action",
    });

    // v2: add createdAt index to queue for orderBy("createdAt") queries
    this.version(2).stores({
      products: "id, shopId, syncStatus",
      sales: "tempId, shopId, syncStatus",
      queue: "++id, type, action, createdAt",
    });

    // v3: add createdAt index to sales for offline listing/sorting
    this.version(3).stores({
      products: "id, shopId, syncStatus",
      sales: "tempId, shopId, syncStatus, createdAt",
      queue: "++id, type, action, createdAt",
    });

    // v4: add expenses and cash tables
    this.version(4).stores({
      products: "id, shopId, syncStatus",
      sales: "tempId, shopId, syncStatus, createdAt",
      expenses: "id, shopId, syncStatus, expenseDate",
      cash: "id, shopId, syncStatus, createdAt",
      queue: "++id, type, action, createdAt",
    });
  }
}

export const db = new PosDexieDB();
