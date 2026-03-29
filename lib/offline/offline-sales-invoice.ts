"use client";

import {
  formatSalesInvoiceNo,
  resolveSalesInvoicePrefix,
} from "@/lib/sales/invoice-format";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";

type OfflineInvoiceOptions = {
  shopId: string;
  enabled: boolean;
  prefix?: string | null;
  nextSequence?: number | null;
  issuedAt?: Date;
};

type OfflineInvoiceState = {
  nextSequence: number;
};

function getStorageKey(shopId: string) {
  return `offline:sales-invoice:${shopId}`;
}

function readState(shopId: string): OfflineInvoiceState | null {
  const raw = safeLocalStorageGet(getStorageKey(shopId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OfflineInvoiceState>;
    const nextSequence = Number(parsed?.nextSequence ?? 0);
    if (!Number.isFinite(nextSequence) || nextSequence < 1) {
      return null;
    }
    return { nextSequence: Math.floor(nextSequence) };
  } catch {
    return null;
  }
}

function writeState(shopId: string, state: OfflineInvoiceState) {
  safeLocalStorageSet(getStorageKey(shopId), JSON.stringify(state));
}

export function reserveOfflineSalesInvoice(options: OfflineInvoiceOptions) {
  if (!options.enabled || !options.shopId) {
    return null;
  }

  const issuedAt = options.issuedAt ?? new Date();
  const prefix = resolveSalesInvoicePrefix(options.prefix);
  const seedSequence = Math.max(1, Math.floor(Number(options.nextSequence ?? 1)));
  const existing = readState(options.shopId);
  const sequence = existing?.nextSequence ?? seedSequence;
  const invoiceNo = formatSalesInvoiceNo(prefix, sequence, issuedAt);

  writeState(options.shopId, { nextSequence: sequence + 1 });

  return {
    invoiceNo,
    issuedAt: issuedAt.toISOString(),
    sequence,
  };
}
