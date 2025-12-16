// prisma/seed/pos/seedCashEntries.ts

import { PrismaClient } from "@prisma/client";
import type { ShopMap } from "../utils";
import { toMoney } from "../utils";

export async function seedCashEntries(prisma: PrismaClient, shops: ShopMap) {
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
    hotel: [
      { entryType: "IN", amount: 6000, reason: "Opening cash" },
      { entryType: "OUT", amount: 1200, reason: "Market purchase" },
      { entryType: "IN", amount: 100, reason: "Due payment from Rahim" },
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
