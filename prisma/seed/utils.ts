// prisma/seed/utils.ts

import crypto from "crypto";
import { Prisma, type Customer, type Product, type Shop } from "@prisma/client";

export const SCRYPT_CONFIG = {
  N: 16384,
  r: 16,
  p: 1,
  keyLength: 64,
  maxmem: 128 * 16384 * 16 * 2,
} as const;

export type LedgerEntry = {
  entryType: "SALE" | "PAYMENT";
  amount: number;
  description?: string | null;
  entryDate: Date;
};

export type ShopMap = Record<string, Shop>;
export type ProductMap = Record<string, Record<string, Product>>;
export type CustomerMap = Record<string, Record<string, Customer>>;

export function hashPassword(password: string): Promise<string> {
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

export function toMoney(value: number | string | Prisma.Decimal): string {
  return new Prisma.Decimal(value).toFixed(2);
}

export function summarizeLedger(entries: LedgerEntry[]) {
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
