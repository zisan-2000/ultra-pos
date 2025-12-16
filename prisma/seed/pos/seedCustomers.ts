// prisma/seed/pos/seedCustomers.ts

import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import type { CustomerMap, LedgerEntry, ShopMap } from "../utils";
import { summarizeLedger, toMoney } from "../utils";

export async function seedCustomers(
  prisma: PrismaClient,
  shops: ShopMap
): Promise<CustomerMap> {
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
    hotel: [
      {
        key: "rahim",
        name: "Rahim Uddin",
        phone: "01711-300001",
        address: "Gazipur",
        ledger: [
          {
            entryType: "SALE",
            amount: 220,
            description: "Lunch on credit",
            entryDate: new Date("2024-12-05T13:30:00Z"),
          },
          {
            entryType: "PAYMENT",
            amount: 100,
            description: "Cash payment",
            entryDate: new Date("2024-12-06T09:00:00Z"),
          },
        ],
      },
      {
        key: "karim",
        name: "Karim Hotel Staff",
        phone: "01711-300002",
        address: "Nearby Market",
        ledger: [],
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
