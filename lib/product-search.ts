const PRODUCT_SEARCH_ALIAS_MAP: Record<string, string[]> = {
  orange: ["কমলা", "orange juice", "কমলার জুস"],
  "orange juice": ["কমলা", "কমলার জুস", "orange"],
  কমলা: ["orange", "orange juice", "কমলার জুস"],
  "কমলার জুস": ["orange", "orange juice", "কমলা"],
  apple: ["আপেল", "apple juice", "আপেলের জুস"],
  "apple juice": ["আপেল", "আপেলের জুস", "apple"],
  আপেল: ["apple", "apple juice", "আপেলের জুস"],
  "আপেলের জুস": ["apple", "apple juice", "আপেল"],
  banana: ["কলা", "banana shake", "কলা শেক"],
  "banana shake": ["banana", "কলা", "কলার শেক", "কলা শেক"],
  কলা: ["banana", "banana shake", "কলার শেক", "কলা শেক"],
  "কলা শেক": ["banana", "banana shake", "কলার শেক"],
  "কলার শেক": ["banana", "banana shake", "কলা শেক"],
  pineapple: ["আনারস", "pineapple juice", "আনারস জুস"],
  "pineapple juice": ["pineapple", "আনারস", "আনারস জুস"],
  আনারস: ["pineapple", "pineapple juice", "আনারস জুস"],
  "আনারস জুস": ["pineapple", "pineapple juice", "আনারস"],
  grape: ["আঙ্গুর", "grape juice", "আঙ্গুর জুস"],
  "grape juice": ["grape", "আঙ্গুর", "আঙ্গুর জুস"],
  আঙ্গুর: ["grape", "grape juice", "আঙ্গুর জুস"],
  mango: ["আম", "mango juice", "আম জুস"],
  "mango juice": ["mango", "আম", "আম জুস"],
  আম: ["mango", "mango juice", "আম জুস"],
  milk: ["দুধ"],
  দুধ: ["milk"],
  water: ["পানি"],
  পানি: ["water"],
  lentil: ["ডাল"],
  dal: ["ডাল"],
  ডাল: ["dal", "lentil"],
  tea: ["চা"],
  চা: ["tea"],
  coffee: ["কফি"],
  কফি: ["coffee"],
  sugar: ["চিনি"],
  চিনি: ["sugar"],
  rice: ["চাল"],
  চাল: ["rice"],
};

export function foldSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeSearchText(value: string): string[] {
  const folded = foldSearchText(value);
  return folded ? folded.split(" ").filter(Boolean) : [];
}

function levenshteinWithin(a: string, b: string, maxDistance: number): boolean {
  if (a === b) return true;
  const aLen = a.length;
  const bLen = b.length;
  if (Math.abs(aLen - bLen) > maxDistance) return false;
  if (!aLen || !bLen) return Math.max(aLen, bLen) <= maxDistance;

  const previous = Array.from({ length: bLen + 1 }, (_, idx) => idx);
  const current = new Array<number>(bLen + 1);

  for (let i = 1; i <= aLen; i += 1) {
    current[0] = i;
    let rowMin = current[0];

    for (let j = 1; j <= bLen; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );
      if (current[j] < rowMin) rowMin = current[j];
    }

    if (rowMin > maxDistance) return false;
    for (let j = 0; j <= bLen; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[bLen] <= maxDistance;
}

function tokenLikelyMatches(queryToken: string, candidateToken: string): boolean {
  if (!queryToken || !candidateToken) return false;
  if (queryToken === candidateToken) return true;
  if (candidateToken.includes(queryToken) || queryToken.includes(candidateToken)) {
    return queryToken.length >= 2 && candidateToken.length >= 2;
  }

  const maxDistance = queryToken.length <= 4 ? 1 : 2;
  return levenshteinWithin(queryToken, candidateToken, maxDistance);
}

function expandAliasTokens(token: string): string[] {
  const folded = foldSearchText(token);
  if (!folded) return [];

  const terms = new Set<string>([folded]);
  const aliases = PRODUCT_SEARCH_ALIAS_MAP[folded] || [];
  for (const alias of aliases) {
    const aliasFolded = foldSearchText(alias);
    if (!aliasFolded) continue;
    terms.add(aliasFolded);
    for (const part of aliasFolded.split(" ")) {
      if (part) terms.add(part);
    }
  }
  return Array.from(terms);
}

export function buildProductSearchTerms(query: string, maxTerms = 8): string[] {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const terms = new Set<string>([cleanQuery]);
  const tokens = tokenizeSearchText(cleanQuery);
  for (const token of tokens) {
    for (const expanded of expandAliasTokens(token)) {
      terms.add(expanded);
      if (terms.size >= maxTerms) {
        return Array.from(terms);
      }
    }
  }
  return Array.from(terms);
}

export function matchesProductSearchQuery(
  query: string,
  searchTarget: string
): boolean {
  const foldedQuery = foldSearchText(query);
  if (!foldedQuery) return true;

  const foldedTarget = foldSearchText(searchTarget);
  if (!foldedTarget) return false;
  if (foldedTarget.includes(foldedQuery)) return true;

  const queryTokens = tokenizeSearchText(foldedQuery);
  if (!queryTokens.length) return true;
  const targetTokens = tokenizeSearchText(foldedTarget);
  if (!targetTokens.length) return false;

  return queryTokens.every((queryToken) => {
    const expanded = expandAliasTokens(queryToken);
    return expanded.some((candidate) =>
      targetTokens.some((targetToken) => tokenLikelyMatches(candidate, targetToken))
    );
  });
}
