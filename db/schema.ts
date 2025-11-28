import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  boolean,
  date,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------
// 1) SHOPS
// ---------------------------------------

export const shops = pgTable(
  "shops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull(), // auth.users.id reference

    name: text("name").notNull(),
    address: text("address"),
    phone: text("phone"),
    businessType: text("business_type").notNull().default("tea_stall"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    ownerIndex: index("idx_shops_owner_id").on(table.ownerId),
  })
);

// ---------------------------------------
// 2) PRODUCTS
// ---------------------------------------

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id").notNull(), // references shops(id)

    name: text("name").notNull(),
    category: text("category").notNull().default("Uncategorized"),
    buyPrice: numeric("buy_price", { precision: 12, scale: 2 }), // optional, default null
    sellPrice: numeric("sell_price", { precision: 12, scale: 2 }).notNull(),
    stockQty: numeric("stock_qty", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    trackStock: boolean("track_stock").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    shopIndex: index("idx_products_shop").on(table.shopId),
    activeIndex: index("idx_products_active").on(table.shopId, table.isActive),
  })
);

// ---------------------------------------
// 3) SALES (Invoice Header)
// ---------------------------------------

export const sales = pgTable(
  "sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id").notNull(),
    customerId: uuid("customer_id"),

    saleDate: timestamp("sale_date", { withTimezone: true })
      .notNull()
      .defaultNow(),

    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),

    paymentMethod: text("payment_method").default("cash"),
    note: text("note"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    shopIndex: index("idx_sales_shop").on(table.shopId),
    customerIndex: index("idx_sales_customer").on(table.customerId),
  })
);

// ---------------------------------------
// 4) SALE ITEMS (Invoice Line Items)
// ---------------------------------------

export const saleItems = pgTable(
  "sale_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    saleId: uuid("sale_id").notNull(),
    productId: uuid("product_id").notNull(),

    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),

    // generated column: line_total = quantity * unit_price
    lineTotal: numeric("line_total", {
      precision: 12,
      scale: 2,
    }).generatedAlwaysAs(`quantity * unit_price`),
  },
  (table) => ({
    saleIndex: index("idx_sale_items_sale").on(table.saleId),
    productIndex: index("idx_sale_items_product").on(table.productId),
  })
);

// ---------------------------------------
// 5) EXPENSES
// ---------------------------------------

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    shopId: uuid("shop_id").notNull(),

    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    category: text("category").notNull(),

    expenseDate: date("expense_date").notNull().defaultNow(),

    note: text("note"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    shopDateIndex: index("idx_expenses_shop_date").on(
      table.shopId,
      table.expenseDate
    ),
  })
);

// ---------------------------------------
// 6) CASH ENTRIES (Cashbook)
// ---------------------------------------

export const cashEntries = pgTable(
  "cash_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    shopId: uuid("shop_id").notNull(),

    entryType: text("entry_type").notNull(), // IN or OUT
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    reason: text("reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    shopIndex: index("idx_cash_entries_shop").on(table.shopId),
  })
);

// ---------------------------------------
// 7) CUSTOMERS (for due/udhar)
// ---------------------------------------

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    address: text("address"),
    totalDue: numeric("total_due", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    lastPaymentAt: timestamp("last_payment_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    shopIndex: index("idx_customers_shop").on(table.shopId),
    phoneIndex: index("idx_customers_phone").on(table.phone),
  })
);

// ---------------------------------------
// 8) CUSTOMER LEDGER (due & payments)
// ---------------------------------------

export const customerLedger = pgTable(
  "customer_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    entryType: text("entry_type").notNull(), // SALE or PAYMENT
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    description: text("description"),
    entryDate: timestamp("entry_date", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    shopIndex: index("idx_customer_ledger_shop").on(table.shopId),
    customerIndex: index("idx_customer_ledger_customer").on(table.customerId),
    entryDateIndex: index("idx_customer_ledger_entry_date").on(table.entryDate),
  })
);
