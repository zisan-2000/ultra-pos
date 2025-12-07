import crypto from "crypto";
import {
  Prisma,
  PrismaClient,
  type Customer,
  type Product,
  type Shop,
  type User,
} from "@prisma/client";

const prisma = new PrismaClient();

const SCRYPT_CONFIG = {
  N: 16384,
  r: 16,
  p: 1,
  keyLength: 64,
  maxmem: 128 * 16384 * 16 * 2,
};

type LedgerEntry = {
  entryType: "SALE" | "PAYMENT";
  amount: number;
  description?: string | null;
  entryDate: Date;
};

type ShopMap = Record<string, Shop>;
type ProductMap = Record<string, Record<string, Product>>;
type CustomerMap = Record<string, Record<string, Customer>>;

function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const normalized = password.normalize("NFKC");
    const salt = crypto.randomBytes(16).toString("hex");

    crypto.scrypt(
      normalized,
      salt,
      SCRYPT_CONFIG.keyLength,
      {
        N: SCRYPT_CONFIG.N,
        r: SCRYPT_CONFIG.r,
        p: SCRYPT_CONFIG.p,
        maxmem: SCRYPT_CONFIG.maxmem,
      },
      (err, derivedKey) => {
        if (err) return reject(err);
        resolve(`${salt}:${derivedKey.toString("hex")}`);
      }
    );
  });
}

function toMoney(value: number | string | Prisma.Decimal): string {
  return new Prisma.Decimal(value).toFixed(2);
}

function summarizeLedger(entries: LedgerEntry[]) {
  let sales = 0;
  let payments = 0;
  let lastPaymentAt: Date | null = null;

  for (const entry of entries) {
    const amount = Number(entry.amount);
    if (!Number.isFinite(amount)) continue;

    if (entry.entryType === "PAYMENT") {
      payments += amount;
      if (!lastPaymentAt || entry.entryDate > lastPaymentAt) {
        lastPaymentAt = entry.entryDate;
      }
    } else {
      sales += amount;
    }
  }

  const due = Math.max(sales - payments, 0);
  return { due: toMoney(due), lastPaymentAt };
}

async function resetDatabase() {
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.cashEntry.deleteMany();
  await prisma.customerLedger.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.product.deleteMany();
  await prisma.shop.deleteMany();
  await prisma.session.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
}

async function seedUser(): Promise<{ user: User; password: string }> {
  const userId = crypto.randomUUID();
  const password = "Demo1234!";
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      id: userId,
      name: "Demo Owner",
      email: "demo@posapp.test",
      emailVerified: true,
      passwordHash,
    },
  });

  await prisma.account.create({
    data: {
      id: crypto.randomUUID(),
      userId,
      providerId: "credential",
      providerUserId: userId,
      accountId: userId,
      password: passwordHash,
      scope: "email:password",
    },
  });

  return { user, password };
}

async function seedShops(userId: string): Promise<ShopMap> {
  const shopsSeed = [
    {
      key: "tea",
      name: "Lalbagh Tea & Snacks",
      address: "Mirpur 10, Dhaka",
      phone: "01700-100000",
      businessType: "tea_stall",
    },
    {
      key: "grocery",
      name: "Green Leaf Mini Grocery",
      address: "Dhanmondi 27, Dhaka",
      phone: "01700-200000",
      businessType: "mini_grocery",
    },
  ];

  const shops: ShopMap = {};
  for (const shop of shopsSeed) {
    const row = await prisma.shop.create({
      data: {
        id: crypto.randomUUID(),
        ownerId: userId,
        name: shop.name,
        address: shop.address,
        phone: shop.phone,
        businessType: shop.businessType,
      },
    });
    shops[shop.key] = row;
  }

  return shops;
}

async function seedProducts(shops: ShopMap): Promise<ProductMap> {
  const productSeed: Record<
    string,
    Array<{
      name: string;
      category: string;
      buyPrice: number | null;
      sellPrice: number;
      stockQty: number;
      trackStock: boolean;
    }>
  > = {
    tea: [
      {
        name: "Milk Tea",
        category: "Beverages",
        buyPrice: 12,
        sellPrice: 25,
        stockQty: 180,
        trackStock: true,
      },
      {
        name: "Black Coffee",
        category: "Beverages",
        buyPrice: 18,
        sellPrice: 40,
        stockQty: 90,
        trackStock: true,
      },
      {
        name: "Paratha",
        category: "Snacks",
        buyPrice: 8,
        sellPrice: 15,
        stockQty: 140,
        trackStock: true,
      },
      {
        name: "Veg Sandwich",
        category: "Snacks",
        buyPrice: 38,
        sellPrice: 60,
        stockQty: 60,
        trackStock: true,
      },
      {
        name: "Bottled Water 500ml",
        category: "Beverages",
        buyPrice: 8,
        sellPrice: 15,
        stockQty: 120,
        trackStock: true,
      },
    ],
    grocery: [
      {
        name: "Miniket Rice 5kg",
        category: "Grains",
        buyPrice: 320,
        sellPrice: 360,
        stockQty: 30,
        trackStock: true,
      },
      {
        name: "Soybean Oil 1L",
        category: "Groceries",
        buyPrice: 165,
        sellPrice: 185,
        stockQty: 55,
        trackStock: true,
      },
      {
        name: "Brown Bread",
        category: "Bakery",
        buyPrice: 55,
        sellPrice: 75,
        stockQty: 45,
        trackStock: true,
      },
      {
        name: "Eggs (Dozen)",
        category: "Dairy",
        buyPrice: 135,
        sellPrice: 155,
        stockQty: 60,
        trackStock: true,
      },
      {
        name: "Toothpaste Family Pack",
        category: "Household",
        buyPrice: 70,
        sellPrice: 99,
        stockQty: 80,
        trackStock: true,
      },
      {
        name: "Dish Soap 500ml",
        category: "Household",
        buyPrice: 55,
        sellPrice: 78,
        stockQty: 70,
        trackStock: true,
      },
    ],
  };

  const products: ProductMap = {};
  for (const [shopKey, entries] of Object.entries(productSeed)) {
    products[shopKey] = {};
    for (const product of entries) {
      const row = await prisma.product.create({
        data: {
          shopId: shops[shopKey].id,
          name: product.name,
          category: product.category,
          buyPrice:
            product.buyPrice === null ? null : toMoney(product.buyPrice),
          sellPrice: toMoney(product.sellPrice),
          stockQty: toMoney(product.stockQty),
          trackStock: product.trackStock,
          isActive: true,
        },
      });

      products[shopKey][product.name] = row;
    }
  }

  return products;
}

async function seedCustomers(shops: ShopMap): Promise<CustomerMap> {
  const customerSeed: Record<
    string,
    Array<{
      key: string;
      name: string;
      phone?: string;
      address?: string;
      ledger: LedgerEntry[];
    }>
  > = {
    tea: [
      {
        key: "kamal",
        name: "Kamal Rahman",
        phone: "01711-100001",
        address: "Mirpur DOHS",
        ledger: [
          {
            entryType: "SALE",
            amount: 260,
            description: "Office snacks on credit",
            entryDate: new Date("2024-12-03T12:30:00Z"),
          },
          {
            entryType: "PAYMENT",
            amount: 100,
            description: "Cash partial payment",
            entryDate: new Date("2024-12-04T09:15:00Z"),
          },
        ],
      },
      {
        key: "mita",
        name: "Mita Akter",
        phone: "01711-100002",
        address: "Tolarbag, Mirpur",
        ledger: [],
      },
    ],
    grocery: [
      {
        key: "rina",
        name: "Rina Akter",
        phone: "01722-200001",
        address: "Dhanmondi 19",
        ledger: [
          {
            entryType: "SALE",
            amount: 980,
            description: "Monthly groceries on credit",
            entryDate: new Date("2024-12-03T16:10:00Z"),
          },
          {
            entryType: "PAYMENT",
            amount: 300,
            description: "bKash part payment",
            entryDate: new Date("2024-12-04T10:20:00Z"),
          },
        ],
      },
      {
        key: "shuvo",
        name: "Shuvo Traders",
        phone: "01722-200002",
        address: "Mohammadpur",
        ledger: [
          {
            entryType: "SALE",
            amount: 1246,
            description: "Cleaning supplies for shop",
            entryDate: new Date("2024-12-05T11:45:00Z"),
          },
          {
            entryType: "PAYMENT",
            amount: 800,
            description: "Cash advance",
            entryDate: new Date("2024-12-06T09:00:00Z"),
          },
        ],
      },
    ],
  };

  const customers: CustomerMap = {};
  for (const [shopKey, entries] of Object.entries(customerSeed)) {
    customers[shopKey] = {};
    for (const customer of entries) {
      const summary = summarizeLedger(customer.ledger);
      const created = await prisma.customer.create({
        data: {
          id: crypto.randomUUID(),
          shopId: shops[shopKey].id,
          name: customer.name,
          phone: customer.phone,
          address: customer.address,
          totalDue: summary.due,
          lastPaymentAt: summary.lastPaymentAt ?? undefined,
        },
      });

      if (customer.ledger.length) {
        await prisma.customerLedger.createMany({
          data: customer.ledger.map((entry) => ({
            shopId: shops[shopKey].id,
            customerId: created.id,
            entryType: entry.entryType,
            amount: toMoney(entry.amount),
            description: entry.description || null,
            entryDate: entry.entryDate,
          })),
        });
      }

      customers[shopKey][customer.key] = created;
    }
  }

  return customers;
}

async function seedSales(
  shops: ShopMap,
  products: ProductMap,
  customers: CustomerMap
) {
  const salesSeed: Array<{
    shopKey: string;
    customerKey?: string;
    paymentMethod: string;
    saleDate: Date;
    note?: string | null;
    items: Array<{ productName: string; qty: number }>;
  }> = [
    {
      shopKey: "tea",
      paymentMethod: "cash",
      saleDate: new Date("2024-12-02T08:30:00Z"),
      note: "Morning rush counter",
      items: [
        { productName: "Milk Tea", qty: 4 },
        { productName: "Paratha", qty: 3 },
        { productName: "Veg Sandwich", qty: 2 },
      ],
    },
    {
      shopKey: "tea",
      customerKey: "kamal",
      paymentMethod: "due",
      saleDate: new Date("2024-12-03T12:20:00Z"),
      note: "Office snacks on credit",
      items: [
        { productName: "Veg Sandwich", qty: 3 },
        { productName: "Black Coffee", qty: 2 },
      ],
    },
    {
      shopKey: "grocery",
      paymentMethod: "cash",
      saleDate: new Date("2024-12-02T10:20:00Z"),
      note: "Walk-in basket",
      items: [
        { productName: "Miniket Rice 5kg", qty: 1 },
        { productName: "Soybean Oil 1L", qty: 1 },
        { productName: "Eggs (Dozen)", qty: 1 },
        { productName: "Toothpaste Family Pack", qty: 1 },
      ],
    },
    {
      shopKey: "grocery",
      customerKey: "rina",
      paymentMethod: "due",
      saleDate: new Date("2024-12-03T16:05:00Z"),
      note: "Monthly groceries on credit",
      items: [
        { productName: "Miniket Rice 5kg", qty: 2 },
        { productName: "Soybean Oil 1L", qty: 1 },
        { productName: "Brown Bread", qty: 1 },
      ],
    },
    {
      shopKey: "grocery",
      customerKey: "shuvo",
      paymentMethod: "due",
      saleDate: new Date("2024-12-05T11:40:00Z"),
      note: "Wholesale cleaning pack",
      items: [
        { productName: "Dish Soap 500ml", qty: 5 },
        { productName: "Toothpaste Family Pack", qty: 4 },
        { productName: "Eggs (Dozen)", qty: 2 },
        { productName: "Brown Bread", qty: 2 },
      ],
    },
  ];

  for (const sale of salesSeed) {
    const shop = shops[sale.shopKey];
    if (!shop) throw new Error(`Shop not found for key ${sale.shopKey}`);

    const customerId =
      sale.customerKey && customers[sale.shopKey]?.[sale.customerKey]
        ? customers[sale.shopKey][sale.customerKey].id
        : null;

    const items = sale.items.map((item) => {
      const product = products[sale.shopKey]?.[item.productName];
      if (!product) {
        throw new Error(
          `Missing product ${item.productName} for shop ${sale.shopKey}`
        );
      }
      const qty = Number(item.qty);
      const unitPrice = parseFloat(product.sellPrice.toString());
      const lineTotal = qty * unitPrice;
      return {
        productId: product.id,
        quantity: qty,
        unitPrice,
        lineTotal,
      };
    });

    const totalAmount = items.reduce((sum, item) => sum + item.lineTotal, 0);

    const createdSale = await prisma.sale.create({
      data: {
        shopId: shop.id,
        customerId,
        saleDate: sale.saleDate,
        totalAmount: toMoney(totalAmount),
        paymentMethod: sale.paymentMethod || "cash",
        note: sale.note || null,
      },
    });

    await prisma.saleItem.createMany({
      data: items.map((item) => ({
        saleId: createdSale.id,
        productId: item.productId,
        quantity: toMoney(item.quantity),
        unitPrice: toMoney(item.unitPrice),
        lineTotal: toMoney(item.lineTotal),
      })),
    });
  }
}

async function seedExpenses(shops: ShopMap) {
  const expenseSeed: Record<
    string,
    Array<{
      amount: number;
      category: string;
      expenseDate: Date;
      note?: string | null;
    }>
  > = {
    tea: [
      {
        amount: 850,
        category: "Utilities",
        expenseDate: new Date("2024-12-01"),
        note: "Gas line refill",
      },
      {
        amount: 1320,
        category: "Supplies",
        expenseDate: new Date("2024-12-02"),
        note: "Milk and tea leaves",
      },
    ],
    grocery: [
      {
        amount: 5100,
        category: "Inventory Purchase",
        expenseDate: new Date("2024-12-03"),
        note: "Dry goods supplier",
      },
      {
        amount: 1250,
        category: "Utilities",
        expenseDate: new Date("2024-12-02"),
        note: "Generator fuel and power",
      },
    ],
  };

  for (const [shopKey, entries] of Object.entries(expenseSeed)) {
    for (const exp of entries) {
      await prisma.expense.create({
        data: {
          shopId: shops[shopKey].id,
          amount: toMoney(exp.amount),
          category: exp.category,
          expenseDate: exp.expenseDate,
          note: exp.note || "",
        },
      });
    }
  }
}

async function seedCashEntries(shops: ShopMap) {
  const cashSeed: Record<
    string,
    Array<{ entryType: "IN" | "OUT"; amount: number; reason?: string | null }>
  > = {
    tea: [
      { entryType: "IN", amount: 5000, reason: "Opening cash float" },
      { entryType: "OUT", amount: 800, reason: "Change provided to staff" },
      { entryType: "IN", amount: 100, reason: "Partial due from Kamal" },
    ],
    grocery: [
      { entryType: "IN", amount: 8000, reason: "Opening cash float" },
      { entryType: "OUT", amount: 2500, reason: "Supplier advance" },
      { entryType: "IN", amount: 300, reason: "Partial due from Rina" },
    ],
  };

  for (const [shopKey, entries] of Object.entries(cashSeed)) {
    for (const entry of entries) {
      await prisma.cashEntry.create({
        data: {
          shopId: shops[shopKey].id,
          entryType: entry.entryType,
          amount: toMoney(entry.amount),
          reason: entry.reason || "",
        },
      });
    }
  }
}

async function main() {
  console.log("Resetting existing data...");
  await resetDatabase();

  console.log("Seeding demo user...");
  const { user, password } = await seedUser();

  console.log("Seeding shops...");
  const shops = await seedShops(user.id);

  console.log("Seeding products...");
  const products = await seedProducts(shops);

  console.log("Seeding customers and ledger...");
  const customers = await seedCustomers(shops);

  console.log("Seeding sales and sale items...");
  await seedSales(shops, products, customers);

  console.log("Seeding expenses...");
  await seedExpenses(shops);

  console.log("Seeding cash entries...");
  await seedCashEntries(shops);

  console.log(`Seed finished. Login with ${user.email} / ${password}`);
}

main()
  .catch((err) => {
    console.error("Seed failed", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
