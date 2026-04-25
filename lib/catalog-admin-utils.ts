export type CatalogImportMatchBy = "name" | "barcode" | "externalRef" | "mixed" | null;

export type CatalogProductRefSnapshot = {
  id: string;
  name: string;
  businessType: string | null;
};

export type CatalogDeleteCandidate = {
  id: string;
  templateCount: number;
  productCount: number;
  mergedChildCount: number;
};

export function normalizeCatalogComparisonKey(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

export function tokenizeCatalogComparisonText(value?: string | null) {
  return normalizeCatalogComparisonKey(value)
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

export function computeCatalogNameSimilarityScore(left?: string | null, right?: string | null) {
  const normalizedLeft = normalizeCatalogComparisonKey(left).replace(/[^a-z0-9]+/g, " ").trim();
  const normalizedRight = normalizeCatalogComparisonKey(right).replace(/[^a-z0-9]+/g, " ").trim();

  if (!normalizedLeft || !normalizedRight) {
    return {
      score: 0,
      reasons: [] as string[],
    };
  }

  if (normalizedLeft === normalizedRight) {
    return {
      score: 6,
      reasons: ["same product name"],
    };
  }

  const reasons: string[] = [];
  let score = 0;
  const prefixLength = Math.min(normalizedLeft.length, normalizedRight.length);
  let sharedPrefixLength = 0;
  while (
    sharedPrefixLength < prefixLength &&
    normalizedLeft[sharedPrefixLength] === normalizedRight[sharedPrefixLength]
  ) {
    sharedPrefixLength += 1;
  }

  if (sharedPrefixLength >= 6) {
    score += 3;
    reasons.push(`strong shared prefix (${sharedPrefixLength} chars)`);
  } else if (sharedPrefixLength >= 4) {
    score += 1;
    reasons.push(`shared prefix (${sharedPrefixLength} chars)`);
  }

  const leftTokens = tokenizeCatalogComparisonText(normalizedLeft);
  const rightTokens = tokenizeCatalogComparisonText(normalizedRight);
  const sharedTokens = leftTokens.filter((token) => rightTokens.includes(token));
  if (sharedTokens.length > 0) {
    score += Math.min(sharedTokens.length * 2, 4);
    reasons.push(`shared name tokens: ${sharedTokens.slice(0, 3).join(", ")}`);
  }

  const bigrams = (value: string) =>
    Array.from({ length: Math.max(0, value.length - 1) }, (_, index) =>
      value.slice(index, index + 2),
    );
  const leftBigrams = bigrams(normalizedLeft.replace(/\s+/g, ""));
  const rightBigrams = bigrams(normalizedRight.replace(/\s+/g, ""));
  if (leftBigrams.length > 0 && rightBigrams.length > 0) {
    const rightBag = new Map<string, number>();
    rightBigrams.forEach((gram) => {
      rightBag.set(gram, (rightBag.get(gram) ?? 0) + 1);
    });
    let overlap = 0;
    leftBigrams.forEach((gram) => {
      const count = rightBag.get(gram) ?? 0;
      if (count > 0) {
        overlap += 1;
        rightBag.set(gram, count - 1);
      }
    });
    const dice = (2 * overlap) / (leftBigrams.length + rightBigrams.length);
    if (dice >= 0.9) {
      score += 4;
      reasons.push(`very high fuzzy name match (${Math.round(dice * 100)}%)`);
    } else if (dice >= 0.75) {
      score += 3;
      reasons.push(`high fuzzy name match (${Math.round(dice * 100)}%)`);
    } else if (dice >= 0.6) {
      score += 1;
      reasons.push(`moderate fuzzy name match (${Math.round(dice * 100)}%)`);
    }
  }

  return { score, reasons };
}

export function formatCatalogProductRef(product?: CatalogProductRefSnapshot) {
  if (!product) return "unknown product";
  return `${product.name} (${product.businessType ?? "global"} · ${product.id})`;
}

export function mergeCatalogMatchedBy(
  current: CatalogImportMatchBy,
  next: Exclude<CatalogImportMatchBy, "mixed" | null>,
): CatalogImportMatchBy {
  if (current === null || current === next) return next;
  return "mixed";
}

export function classifyCatalogBulkDeleteCandidates(rows: CatalogDeleteCandidate[]) {
  const deletableIds = rows
    .filter(
      (row) =>
        row.templateCount === 0 && row.productCount === 0 && row.mergedChildCount === 0,
    )
    .map((row) => row.id);
  const linkedCount = rows.filter((row) => row.templateCount > 0 || row.productCount > 0).length;
  const protectedCount = rows.filter((row) => row.mergedChildCount > 0).length;

  return {
    deletableIds,
    linkedCount,
    protectedCount,
    skippedCount: rows.length - deletableIds.length,
  };
}
