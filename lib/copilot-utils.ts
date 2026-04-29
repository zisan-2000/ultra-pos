import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeCopilotQuestion } from "@/lib/copilot-ask";

// ---------------------------------------------------------------------------
// Shared scoring / normalization utilities for Owner Copilot
// ---------------------------------------------------------------------------

export function normalizeSearchValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[?？！!।,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(?:এর|র|য়ের|কে)$/u, "")
    .trim();
}

export function scoreEntityMatch(candidate: string, asked: string) {
  const left = normalizeSearchValue(candidate).replace(/\s+/g, "");
  const right = normalizeSearchValue(asked).replace(/\s+/g, "");
  if (!left || !right) return 0;
  if (left === right) return 100;
  if (left.startsWith(right)) return 80;
  if (left.includes(right)) return 60;
  if (right.includes(left)) return 40;
  return 0;
}

export function normalizeName(value: string) {
  return normalizeCopilotQuestion(value).replace(/\s+/g, "");
}

export function scoreCustomerMatch(customerName: string, askedName: string) {
  const customer = normalizeName(customerName);
  const asked = normalizeName(askedName);
  if (!customer || !asked) return 0;
  if (customer === asked) return 100;
  if (customer.startsWith(asked)) return 80;
  if (customer.includes(asked)) return 60;
  if (asked.includes(customer)) return 40;
  return 0;
}

export function scoreProductMatch(productName: string, askedName: string) {
  const product = normalizeName(productName);
  const asked = normalizeName(askedName);
  if (!product || !asked) return 0;
  if (product === asked) return 100;
  if (product.startsWith(asked)) return 85;
  if (product.includes(asked)) return 65;
  if (asked.includes(product)) return 45;
  return 0;
}

// ---------------------------------------------------------------------------
// Shared entity finders
// ---------------------------------------------------------------------------

export async function findBestCustomer(shopId: string, askedName: string) {
  const candidates = await prisma.customer.findMany({
    where: {
      shopId,
      name: {
        contains: askedName.trim(),
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      name: true,
      totalDue: true,
      lastPaymentAt: true,
    },
    orderBy: [{ totalDue: "desc" }, { name: "asc" }],
    take: 8,
  });

  if (candidates.length === 0) return null;

  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: scoreCustomerMatch(candidate.name, askedName),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.candidate.totalDue) - Number(a.candidate.totalDue)
    );

  return scored[0]?.score > 0 ? scored[0].candidate : null;
}

export async function findBestProduct(shopId: string, askedName: string) {
  const candidates = await prisma.product.findMany({
    where: {
      shopId,
      OR: [
        {
          name: {
            contains: askedName.trim(),
            mode: "insensitive",
          },
        },
        {
          sku: {
            contains: askedName.trim(),
            mode: "insensitive",
          },
        },
        {
          barcode: {
            contains: askedName.trim(),
            mode: "insensitive",
          },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      category: true,
      sellPrice: true,
      stockQty: true,
      baseUnit: true,
      sku: true,
      barcode: true,
      isActive: true,
      trackStock: true,
    },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    take: 10,
  });

  if (candidates.length === 0) return null;

  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: Math.max(
        scoreProductMatch(candidate.name, askedName),
        candidate.sku ? scoreProductMatch(candidate.sku, askedName) - 10 : 0,
        candidate.barcode
          ? scoreProductMatch(candidate.barcode, askedName) - 10
          : 0
      ),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.candidate.isActive) - Number(a.candidate.isActive)
    );

  return scored[0]?.score > 0 ? scored[0].candidate : null;
}

export async function findSaleByQuery(shopId: string, query: string) {
  const safeQuery = (query || "").trim();
  if (!safeQuery) return null;

  const saleOrFilters: Prisma.SaleWhereInput[] = [
    { invoiceNo: { contains: safeQuery, mode: "insensitive" } },
    {
      customer: {
        is: { name: { contains: safeQuery, mode: "insensitive" } },
      },
    },
  ];

  if (/^[a-z0-9_-]{10,}$/i.test(safeQuery)) {
    saleOrFilters.push({ id: safeQuery });
  }

  const candidates = await prisma.sale.findMany({
    where: { shopId, OR: saleOrFilters },
    select: {
      id: true,
      invoiceNo: true,
      totalAmount: true,
      paymentMethod: true,
      status: true,
      customer: { select: { name: true } },
    },
    orderBy: [{ saleDate: "desc" }, { id: "desc" }],
    take: 1,
  });

  return candidates[0] ?? null;
}

// ---------------------------------------------------------------------------
// JSON extraction (shared between LLM and tool orchestrator)
// ---------------------------------------------------------------------------

export function extractJsonObject(rawText: string) {
  const trimmed = rawText.trim();
  const cleaned = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }
    try {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Money formatting
// ---------------------------------------------------------------------------

const bnMoneyFormatter = new Intl.NumberFormat("bn-BD", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(value: unknown) {
  const numeric = Number(
    typeof value === "object" && value !== null ? String(value) : value ?? 0
  );
  if (!Number.isFinite(numeric)) return "৳ 0";
  return `৳ ${bnMoneyFormatter.format(numeric)}`;
}

// ---------------------------------------------------------------------------
// Amount validation (Fix 2)
// ---------------------------------------------------------------------------

const COPILOT_AMOUNT_MAX = 10_000_000;

export function validateCopilotAmount(raw: string | number): number {
  const numeric = typeof raw === "string" ? Number(raw) : raw;
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error("Amount অবশ্যই 0 এর বেশি হতে হবে");
  }
  if (numeric > COPILOT_AMOUNT_MAX) {
    throw new Error(
      `Amount সর্বোচ্চ ৳ ${COPILOT_AMOUNT_MAX.toLocaleString()} পর্যন্ত সমর্থিত`
    );
  }
  return Number(numeric.toFixed(2));
}

// ---------------------------------------------------------------------------
// Prompt injection sanitization (Fix 6)
// ---------------------------------------------------------------------------

const COPILOT_INPUT_MAX_LENGTH = 500;

export function sanitizeCopilotInput(text: string): string {
  let sanitized = text.trim();
  if (sanitized.length > COPILOT_INPUT_MAX_LENGTH) {
    sanitized = sanitized.slice(0, COPILOT_INPUT_MAX_LENGTH);
  }
  sanitized = sanitized
    .replace(/```[\s\S]*?```/g, "")
    .replace(/```/g, "");
  return sanitized;
}

export function wrapUserContent(text: string): string {
  return `[USER_QUESTION_START] ${sanitizeCopilotInput(text)} [USER_QUESTION_END]`;
}
