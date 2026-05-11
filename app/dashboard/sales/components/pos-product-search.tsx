// app/dashboard/sales/components/PosProductSearch.tsx
"use client";

import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { LayoutGrid, List } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { getStockToneClasses } from "@/lib/stock-level";
import ConfirmDialog from "@/components/confirm-dialog";
import {
  CAMERA_DUPLICATE_WINDOW_MS,
  isEditableElement,
  isRapidDuplicateScan,
  MANUAL_DUPLICATE_WINDOW_MS,
  playScannerFeedbackTone,
  SCAN_IDLE_SUBMIT_MS,
} from "@/lib/scanner/ux";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";

type PosProductSearchProps = {
  shopId: string;
  canUseBarcodeScan: boolean;
  topProductIds?: string[];
  onSerialRequired?: (
    itemKey: string,
    productId: string,
    productName: string,
    variantId: string | null,
    qty: number
  ) => void;
  products: {
    id: string;
    name: string;
    sku?: string | null;
    barcode?: string | null;
    sellPrice: string;
    stockQty?: string | number;
    category?: string | null;
    storageLocation?: string | null;
    trackStock?: boolean | null;
    trackSerialNumbers?: boolean | null;
    trackBatch?: boolean | null;
    trackCutLength?: boolean | null;
    baseUnit?: string | null;
    defaultCutLength?: string | null;
    variants?: Array<{
      id: string;
      label: string;
      sellPrice: string;
      stockQty?: string | number;
      storageLocation?: string | null;
      sku?: string | null;
      barcode?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    }>;
  }[];
};

type UsageEntry = { count: number; lastUsed: number; favorite?: boolean };
type EnrichedProduct = PosProductSearchProps["products"][number] & {
  category: string;
};
type ProductVariantOption = NonNullable<EnrichedProduct["variants"]>[number];
type QuickSlot = EnrichedProduct | null;
type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

type CameraBarcodeDetector = {
  detect: (
    source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap
  ) => Promise<Array<{ rawValue?: string }>>;
};

type ScannerSuspendDetail = {
  shopId?: string;
  ms?: number;
};
type PosInputMode = "search" | "scanner";
type PosProductViewMode = "grid" | "list";
type VoiceSearchMode = "bn" | "en";
type VariantPickerState = {
  product: EnrichedProduct;
  quantity: number;
};
type CodeLookupMatch = {
  product: EnrichedProduct;
  variant?: ProductVariantOption;
};
type VoiceProductMatch = {
  product: EnrichedProduct;
  score: number;
  transcript: string;
  matchKind: "exact" | "startsWith" | "contains" | "token" | "fuzzy";
};

const QUICK_LIMIT = 8; // fixed slots so buttons never jump during a session
const INITIAL_RENDER = 60;
const RENDER_BATCH = 40;
const SCANNER_INTERACTION_PAUSE_MS = 2200;
const VOICE_LANG_BY_MODE: Record<VoiceSearchMode, string> = {
  bn: "bn-BD",
  en: "en-US",
};
const VOICE_SEARCH_ALIAS_MAP: Record<string, string[]> = {
  orange: ["কমলা", "কমলারস", "orange juice", "orenge"],
  "অরেঞ্জ": ["orange", "কমলা", "orange juice"],
  "কমলা": ["orange", "orange juice", "কমলার রস", "কমলারস"],
  mango: ["আম", "mengo", "mango juice"],
  "আম": ["mango", "mango juice"],
  lemon: ["লেবু", "lemon juice"],
  "লেবু": ["lemon", "lemon juice"],
  juice: ["জুস", "রস"],
  "জুস": ["juice", "রস"],
  "রস": ["juice", "জুস"],
  shake: ["শেক", "milkshake", "milk shake"],
  "শেক": ["shake", "milkshake"],
  milk: ["দুধ", "milkshake", "milk shake"],
  "দুধ": ["milk", "milkshake"],
  tea: ["চা"],
  "চা": ["tea"],
  coffee: ["কফি"],
  "কফি": ["coffee"],
  chicken: ["চিকেন"],
  "চিকেন": ["chicken"],
  beef: ["বিফ", "গরু"],
  "বিফ": ["beef"],
  egg: ["ডিম"],
  "ডিম": ["egg"],
  rice: ["ভাত", "রাইস"],
  "ভাত": ["rice", "রাইস"],
  curry: ["কারি", "কারি", "ঝোল"],
  "কারি": ["curry"],
  burger: ["বার্গার"],
  "বার্গার": ["burger"],
  pizza: ["পিজ্জা"],
  "পিজ্জা": ["pizza"],
  coke: ["কোক", "cola", "coca cola"],
  "কোক": ["coke", "cola"],
  water: ["পানি", "জল"],
  "পানি": ["water", "জল"],
  "জল": ["water", "পানি"],
};

function dedupeStringList(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeVoiceTranscript(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function scheduleIdle(callback: () => void) {
  const g = globalThis as typeof globalThis & {
    requestIdleCallback?: (
      cb: () => void,
      options?: { timeout?: number }
    ) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  if (typeof g.requestIdleCallback === "function") {
    const id = g.requestIdleCallback(callback, { timeout: 200 });
    return () => g.cancelIdleCallback?.(id);
  }

  const id = setTimeout(callback, 16);
  return () => clearTimeout(id);
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}

function normalizeCategory(raw?: string | null) {
  const trimmed = (raw || "").trim();
  return trimmed || "Uncategorized";
}

function toNumber(val: string | number | undefined) {
  return Number(val ?? 0);
}

function normalizeCodeInput(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

function normalizeVoiceTranscript(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function foldSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeSearchText(value: string) {
  const folded = foldSearchText(value);
  return folded ? folded.split(" ") : [];
}

function levenshteinWithin(a: string, b: string, maxDistance: number) {
  if (a === b) return true;
  const aLen = a.length;
  const bLen = b.length;
  if (!aLen || !bLen) return false;
  if (Math.abs(aLen - bLen) > maxDistance) return false;

  let prev = Array.from({ length: bLen + 1 }, (_, i) => i);
  for (let i = 1; i <= aLen; i += 1) {
    const curr = [i];
    let minInRow = curr[0];
    for (let j = 1; j <= bLen; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const next = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
      curr.push(next);
      if (next < minInRow) minInRow = next;
    }
    if (minInRow > maxDistance) return false;
    prev = curr;
  }
  return prev[bLen] <= maxDistance;
}

function isFuzzyTokenMatch(queryToken: string, candidateToken: string) {
  if (!queryToken || !candidateToken) return false;
  if (candidateToken.includes(queryToken)) return true;
  if (queryToken.length < 3 || candidateToken.length < 3) return false;
  if (Math.abs(queryToken.length - candidateToken.length) > 3) return false;
  if (
    queryToken.length <= 6 &&
    queryToken[0] !== candidateToken[0]
  ) {
    return false;
  }

  const maxDistance =
    queryToken.length <= 5 ? 1 : queryToken.length <= 8 ? 2 : 3;
  return levenshteinWithin(queryToken, candidateToken, maxDistance);
}

function expandAliasTokens(token: string) {
  const foldedToken = foldSearchText(token);
  if (!foldedToken) return [] as string[];
  const terms = new Set<string>([foldedToken]);
  const aliases = VOICE_SEARCH_ALIAS_MAP[foldedToken] || [];
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

function buildSearchableVoiceFields(product: EnrichedProduct) {
  const fields: string[] = [
    product.name,
    product.category,
    String(product.sku || ""),
    String(product.barcode || ""),
  ];

  for (const variant of getActiveVariants(product)) {
    fields.push(
      String(variant.label || ""),
      String(variant.sku || ""),
      String(variant.barcode || "")
    );
  }

  return fields
    .map((field) => normalizeVoiceTranscript(field))
    .filter(Boolean);
}

function scoreVoiceTranscriptForProduct(
  transcript: string,
  product: EnrichedProduct,
  usage: Record<string, UsageEntry>
): VoiceProductMatch | null {
  const foldedTranscript = foldSearchText(transcript);
  const transcriptTokens = tokenizeSearchText(transcript);
  if (!foldedTranscript || transcriptTokens.length === 0) return null;

  const fields = buildSearchableVoiceFields(product);
  const foldedFields = fields.map((field) => foldSearchText(field)).filter(Boolean);
  if (foldedFields.length === 0) return null;

  let score = 0;
  let matchKind: VoiceProductMatch["matchKind"] = "fuzzy";

  for (const field of foldedFields) {
    if (field === foldedTranscript) {
      score = Math.max(score, 320);
      matchKind = "exact";
    } else if (field.startsWith(foldedTranscript)) {
      score = Math.max(score, 240);
      if (matchKind !== "exact") matchKind = "startsWith";
    } else if (field.includes(foldedTranscript)) {
      score = Math.max(score, 180);
      if (matchKind === "fuzzy") matchKind = "contains";
    }
  }

  const fieldTokens = foldedFields.flatMap((field) => field.split(" "));
  let matchedTokens = 0;
  let fuzzyHitCount = 0;

  for (const token of transcriptTokens) {
    const expanded = expandAliasTokens(token);
    let tokenMatched = false;

    for (const candidate of expanded) {
      if (foldedFields.some((field) => field.includes(candidate))) {
        matchedTokens += 1;
        tokenMatched = true;
        if (matchKind === "fuzzy") matchKind = "token";
        break;
      }

      if (
        fieldTokens.some((fieldToken) => isFuzzyTokenMatch(candidate, fieldToken))
      ) {
        matchedTokens += 1;
        fuzzyHitCount += 1;
        tokenMatched = true;
        break;
      }
    }

    if (!tokenMatched && transcriptTokens.length > 1) {
      score -= 24;
    }
  }

  if (matchedTokens > 0) {
    score += matchedTokens * 48;
    if (matchedTokens === transcriptTokens.length) {
      score += 70;
    } else {
      score -= (transcriptTokens.length - matchedTokens) * 12;
    }
  }

  if (fuzzyHitCount > 0) {
    score -= fuzzyHitCount * 8;
    if (matchKind === "fuzzy") {
      matchKind = "fuzzy";
    }
  }

  const usageEntry = usage[product.id];
  if (usageEntry?.favorite) score += 16;
  if (usageEntry?.count) score += Math.min(usageEntry.count, 12);
  if (usageEntry?.lastUsed) score += 6;

  if (score < 80) return null;

  return {
    product,
    score,
    transcript,
    matchKind,
  };
}

function rankVoiceProductMatches(
  transcripts: string[],
  products: EnrichedProduct[],
  usage: Record<string, UsageEntry>
) {
  const ranked = new Map<string, VoiceProductMatch>();
  for (const transcript of transcripts) {
    for (const product of products) {
      const candidate = scoreVoiceTranscriptForProduct(transcript, product, usage);
      if (!candidate) continue;
      const existing = ranked.get(product.id);
      if (!existing || existing.score < candidate.score) {
        ranked.set(product.id, candidate);
      }
    }
  }

  return Array.from(ranked.values()).sort(
    (a, b) =>
      b.score - a.score ||
      a.product.name.localeCompare(b.product.name)
  );
}

function getActiveVariants(product: EnrichedProduct): ProductVariantOption[] {
  if (!Array.isArray(product.variants)) return [];
  return product.variants
    .filter((variant) => variant && variant.isActive !== false)
    .sort(
      (a, b) =>
        Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) ||
        String(a.label || "").localeCompare(String(b.label || ""))
    );
}

function buildCartItemName(
  product: EnrichedProduct,
  variant?: ProductVariantOption
) {
  if (!variant) return product.name;
  const label = String(variant.label || "").trim();
  return label ? `${product.name} (${label})` : product.name;
}

function buildCartItemKey(productId: string, variantId?: string | null) {
  return variantId ? `${productId}:${variantId}` : productId;
}

function formatCategoryLabel(raw: string) {
  if (!raw) return "বিভাগহীন";
  const normalized = raw.trim();
  if (!normalized) return "বিভাগহীন";

  const dictionary: Record<string, string> = {
    uncategorized: "বিভাগহীন",
    category: "ক্যাটাগরি",
    cement: "সিমেন্ট",
    building: "বিল্ডিং",
    hardware: "হার্ডওয়্যার",
    rod: "রড",
    steel: "স্টিল",
    rice: "চাল/ভাত",
    grocery: "মুদি",
    snacks: "স্ন্যাক্স",
    beverage: "পানীয়",
    beverages: "পানীয়",
    tea: "চা",
    coffee: "কফি",
    juice: "জুস",
    dairy: "দুগ্ধ",
    medicine: "ঔষধ",
    pharmacy: "ফার্মেসি",
    cosmetics: "কসমেটিকস",
    stationery: "স্টেশনারি",
    clothes: "কাপড়",
    clothing: "কাপড়",
    vegetables: "সবজি",
    vegetable: "সবজি",
    fruits: "ফল",
    fruit: "ফল",
    recharge: "রিচার্জ",
  };

  const translated = normalized
    .split(/[\s/_&-]+/)
    .filter(Boolean)
    .map((token) => {
      const lower = token.toLowerCase();
      return dictionary[lower] ?? token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    });

  return translated.join(" / ");
}

function buildVariantStockLabel(stock: number, unit: string, tracksStock: boolean) {
  if (!tracksStock) return null;
  if (stock <= 0) return "শেষ হয়েছে";
  const suffix = unit ? ` ${unit}` : "";
  if (stock <= 5) return `⚠ ${stock.toFixed(0)}${suffix}`;
  return `✓ ${stock.toFixed(0)}${suffix}`;
}

function getCartQtyForSelection(
  cartItems: Array<{ productId: string; variantId?: string | null; qty: number }>,
  productId: string,
  variantId?: string | null
) {
  return cartItems
    .filter((item) =>
      variantId
        ? item.productId === productId && item.variantId === variantId
        : item.productId === productId && !item.variantId
    )
    .reduce((sum, item) => sum + Number(item.qty || 0), 0);
}

function getAvailableStockForSelection(
  product: EnrichedProduct,
  cartItems: Array<{ productId: string; variantId?: string | null; qty: number }>,
  variant?: ProductVariantOption
) {
  if (product.trackStock !== true) return Number.POSITIVE_INFINITY;
  const stock = variant ? toNumber(variant.stockQty) : toNumber(product.stockQty);
  const inCart = getCartQtyForSelection(cartItems, product.id, variant?.id ?? null);
  return Math.max(0, stock - inCart);
}

function buildQuickSlots(
  products: EnrichedProduct[],
  usageSeed: Record<string, UsageEntry>,
  dbRankMap: Map<string, number> = new Map()
): QuickSlot[] {
  const sorted = products.slice().sort((a, b) => {
    const ua = usageSeed[a.id] || {};
    const ub = usageSeed[b.id] || {};

    const favoriteDiff =
      Number(ub.favorite || false) - Number(ua.favorite || false);
    if (favoriteDiff !== 0) return favoriteDiff;

    const countDiff = (ub.count ?? 0) - (ua.count ?? 0);
    if (countDiff !== 0) return countDiff;

    const recencyDiff = (ub.lastUsed ?? 0) - (ua.lastUsed ?? 0);
    if (recencyDiff !== 0) return recencyDiff;

    // DB rank: lower index = top seller (only kicks in when localStorage has no data)
    const dbDiff = (dbRankMap.get(a.id) ?? 9999) - (dbRankMap.get(b.id) ?? 9999);
    if (dbDiff !== 0) return dbDiff;

    return a.name.localeCompare(b.name);
  });

  const slots: QuickSlot[] = Array(QUICK_LIMIT).fill(null);
  const limit = Math.min(QUICK_LIMIT, sorted.length);
  for (let i = 0; i < limit; i += 1) {
    slots[i] = sorted[i];
  }
  return slots;
}

function areSlotIdsEqual(
  a: Array<string | null>,
  b: Array<string | null>
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

const ProductButton = memo(function ProductButton({
  product,
  onAdd,
  isRecentlyAdded,
  isCooldown,
}: {
  product: EnrichedProduct;
  onAdd: (product: EnrichedProduct) => void;
  isRecentlyAdded: boolean;
  isCooldown: boolean;
}) {
  const tracksStock = product.trackStock === true;
  const activeVariants = getActiveVariants(product);
  const variantCount = activeVariants.length;
  const hasVariants = variantCount > 0;

  // For variant products, use sum of variant stocks (parent stock is never decremented)
  const displayStock = hasVariants
    ? activeVariants.reduce((sum, v) => sum + toNumber(v.stockQty), 0)
    : toNumber(product.stockQty);

  const stockStyle = tracksStock
    ? getStockToneClasses(displayStock).badge
    : "bg-muted text-muted-foreground border border-border/60";

  return (
    <button
      key={product.id}
      type="button"
      className={`relative w-full h-full min-h-[150px] text-left rounded-2xl border border-border bg-gradient-to-br from-card via-card to-muted/40 shadow-[0_8px_20px_rgba(15,23,42,0.08)] hover:border-primary/40 hover:shadow-[0_12px_26px_rgba(15,23,42,0.12)] transition-all p-3.5 pressable active:scale-[0.98] active:translate-y-[1px] ${
        isRecentlyAdded ? "ring-2 ring-success/30" : ""
      } ${tracksStock && displayStock <= 0 ? "opacity-80" : ""} ${
        isCooldown ? "opacity-95 shadow-inner border-success/30" : ""
      }`}
      onClick={() => onAdd(product)}
    >
      <div className="flex items-start justify-between gap-2 relative">
        <h3 className="flex-1 font-semibold text-foreground text-sm sm:text-base leading-snug line-clamp-2">
          {product.name}
        </h3>
        <span
          className={`inline-flex items-center justify-center px-2.5 py-1 min-w-[44px] rounded-full text-[11px] font-semibold shadow-sm ${stockStyle}`}
        >
          {tracksStock ? displayStock.toFixed(0) : "N/A"}
        </span>
        {isRecentlyAdded && (
          <span className="absolute -top-1 -right-1 bg-success text-primary-foreground text-[10px] font-semibold px-2 py-0.5 rounded-full pop-badge">
            +1
          </span>
        )}
      </div>
      <p className="text-lg font-bold text-foreground mt-2">
        <span className="text-muted-foreground">৳</span> {product.sellPrice}
      </p>
      <p className="mt-2 text-[11px] font-medium tracking-[0.08em] text-muted-foreground">
        {formatCategoryLabel(product.category)}
      </p>
      {product.storageLocation ? (
        <p className="mt-1 text-[11px] font-medium text-primary">
          📍 {product.storageLocation}
        </p>
      ) : null}
      {hasVariants ? (
        <p className="mt-1 text-[11px] font-semibold text-primary">
          {variantCount}টি সাইজ →
        </p>
      ) : null}
    </button>
  );
});

export const PosProductSearch = memo(function PosProductSearch({
  products,
  shopId,
  canUseBarcodeScan,
  topProductIds,
  onSerialRequired,
}: PosProductSearchProps) {
  const [query, setQuery] = useState("");
  const [scanCode, setScanCode] = useState("");
  const [scanFeedback, setScanFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraTorchSupported, setCameraTorchSupported] = useState(false);
  const [cameraTorchOn, setCameraTorchOn] = useState(false);
  const [cameraContinuousMode, setCameraContinuousMode] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const [usage, setUsage] = useState<Record<string, UsageEntry>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const stored = safeLocalStorageGet(`pos-usage-${shopId}`);
      return stored ? (JSON.parse(stored) as Record<string, UsageEntry>) : {};
    } catch {
      return {};
    }
  });
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceHeard, setVoiceHeard] = useState("");
  const [voiceMatches, setVoiceMatches] = useState<VoiceProductMatch[]>([]);
  const [voiceMode, setVoiceMode] = useState<VoiceSearchMode>(() => {
    if (typeof window === "undefined") return "bn";
    const stored = safeLocalStorageGet(`pos-voice-mode:${shopId}`);
    return stored === "en" ? "en" : "bn";
  });
  const [recentlyAdded, setRecentlyAdded] = useState<string | null>(null);
  const [cooldownProductId, setCooldownProductId] = useState<string | null>(
    null
  );
  const [quickSlotIds, setQuickSlotIds] = useState<Array<string | null>>(
    () => Array(QUICK_LIMIT).fill(null)
  );
  const [quickSlotsReady, setQuickSlotsReady] = useState(false);
  const [stockConfirm, setStockConfirm] = useState<{
    product: EnrichedProduct;
    variant?: ProductVariantOption;
    quantity: number;
    message: string;
    allowOverride?: boolean;
  } | null>(null);
  const [variantPicker, setVariantPicker] = useState<VariantPickerState | null>(
    null
  );

  const add = useCart((s: any) => s.add);
  const cartItems = useCart((s: any) => s.items);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const voiceCancelRequestedRef = useRef(false);
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const categoryChipsRef = useRef<HTMLDivElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraScanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraDetectorRef = useRef<CameraBarcodeDetector | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const lastCameraHitRef = useRef<{ code: string; at: number } | null>(null);
  const lastProcessedScanRef = useRef<{ code: string; at: number } | null>(
    null
  );
  const scanIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanFocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scannerSuspendUntilRef = useRef(0);
  const cameraContinuousRef = useRef(false);
  const lastAddRef = useRef(0);
  const recentlyAddedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const cooldownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sessionUsageSnapshot] = useState<Record<string, UsageEntry>>(
    () => usage
  );
  const storageKey = useMemo(() => `pos-usage-${shopId}`, [shopId]);
  const quickSlotStorageKey = useMemo(
    () => `pos-quick-slots-${shopId}`,
    [shopId]
  );
  const dbRankMap = useMemo(
    () => new Map((topProductIds ?? []).map((id, i) => [id, i])),
    [topProductIds]
  );
  const [renderCount, setRenderCount] = useState(INITIAL_RENDER);
  const [showCategoryOverflowCue, setShowCategoryOverflowCue] = useState(false);
  const [categoryScrollAtEnd, setCategoryScrollAtEnd] = useState(true);
  const [productViewMode, setProductViewMode] =
    useState<PosProductViewMode>("grid");

  const deferredQuery = useDeferredValue(query);
  const debouncedQuery = useDebounce(deferredQuery, 200);
  const inputModeStorageKey = useMemo(
    () => `pos-input-mode:${shopId}`,
    [shopId]
  );
  const voiceModeStorageKey = useMemo(
    () => `pos-voice-mode:${shopId}`,
    [shopId]
  );
  const [inputMode, setInputMode] = useState<PosInputMode>("search");
  const scannerAssistEnabled = canUseBarcodeScan && inputMode === "scanner";

  const variantPickerMaxAvailable = useMemo(() => {
    if (!variantPicker) return Number.POSITIVE_INFINITY;
    if (variantPicker.product.trackStock !== true) return Number.POSITIVE_INFINITY;
    const variants = getActiveVariants(variantPicker.product);
    if (variants.length === 0) return 0;
    return variants.reduce((max, variant) => {
      const available = getAvailableStockForSelection(
        variantPicker.product,
        cartItems,
        variant
      );
      return Math.max(max, available);
    }, 0);
  }, [variantPicker, cartItems]);

  const variantPickerHasAnyAvailable = useMemo(
    () => variantPickerMaxAvailable > 0 || !Number.isFinite(variantPickerMaxAvailable),
    [variantPickerMaxAvailable]
  );

  const variantPickerQuantityWarning = useMemo(() => {
    if (!variantPicker || variantPicker.product.trackStock !== true) return null;
    if (!Number.isFinite(variantPickerMaxAvailable)) return null;
    if (variantPickerMaxAvailable <= 0) {
      return "এই product-এর কোনো variant-এ এখন আর available stock নেই।";
    }
    if (variantPicker.quantity > variantPickerMaxAvailable + 0.000001) {
      return `এই quantity-তে stock পাওয়া যাচ্ছে না। সর্বোচ্চ ${variantPickerMaxAvailable.toFixed(
        2
      )} ${variantPicker.product.baseUnit || "টি"} পর্যন্ত যোগ করা যাবে।`;
    }
    return null;
  }, [variantPicker, variantPickerMaxAvailable]);

  useEffect(() => {
    if (!variantPicker) return;
    if (variantPicker.product.trackStock !== true) return;
    if (!Number.isFinite(variantPickerMaxAvailable)) return;
    const clampedQty =
      variantPickerMaxAvailable <= 0
        ? 0.01
        : Math.min(Math.max(0.01, variantPicker.quantity), variantPickerMaxAvailable);
    if (Math.abs(clampedQty - variantPicker.quantity) < 0.000001) return;
    setVariantPicker((current) =>
      current ? { ...current, quantity: Number(clampedQty.toFixed(2)) } : current
    );
  }, [variantPicker, variantPickerMaxAvailable]);

  // Persist usage separately to avoid doing localStorage writes in setState updaters
  useEffect(() => {
    if (typeof window === "undefined") return;
    const cancel = scheduleIdle(() => {
      try {
        safeLocalStorageSet(storageKey, JSON.stringify(usage));
      } catch {
        // ignore quota / serialization errors in production UI
      }
    });
    return () => cancel();
  }, [usage, storageKey]);

  useEffect(() => {
    return () => {
      voiceCancelRequestedRef.current = true;
      recognitionRef.current?.stop?.();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognitionImpl =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setVoiceReady(Boolean(SpeechRecognitionImpl));
  }, []);

  useEffect(() => {
    try {
      const stored = safeLocalStorageGet(inputModeStorageKey);
      if (stored === "scanner" && canUseBarcodeScan) {
        setInputMode("scanner");
        return;
      }
      setInputMode("search");
    } catch {
      // ignore local preference read errors
    }
  }, [inputModeStorageKey, canUseBarcodeScan]);

  useEffect(() => {
    try {
      safeLocalStorageSet(inputModeStorageKey, inputMode);
    } catch {
      // ignore local preference write errors
    }
  }, [inputMode, inputModeStorageKey]);

  useEffect(() => {
    try {
      safeLocalStorageSet(voiceModeStorageKey, voiceMode);
    } catch {
      // ignore local preference write errors
    }
  }, [voiceMode, voiceModeStorageKey]);

  useEffect(() => {
    if (!canUseBarcodeScan && inputMode === "scanner") {
      setInputMode("search");
    }
  }, [canUseBarcodeScan, inputMode]);

  useEffect(() => {
    if (inputMode === "scanner") {
      setQuery("");
      setShowAllProducts(false);
      setRenderCount(INITIAL_RENDER);
      voiceCancelRequestedRef.current = true;
      recognitionRef.current?.stop?.();
      setListening(false);
      setVoiceError(null);
      return;
    }
    setScanFeedback(null);
  }, [inputMode]);

  const stopCamera = useCallback(() => {
    if (cameraScanTimerRef.current) {
      clearTimeout(cameraScanTimerRef.current);
      cameraScanTimerRef.current = null;
    }
    const stream = cameraStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    cameraStreamRef.current = null;
    cameraTrackRef.current = null;
    cameraDetectorRef.current = null;
    setCameraReady(false);
    setCameraTorchSupported(false);
    setCameraTorchOn(false);
  }, []);

  const clearScanTimers = useCallback(() => {
    if (scanIdleTimerRef.current) {
      clearTimeout(scanIdleTimerRef.current);
      scanIdleTimerRef.current = null;
    }
    if (scanFocusTimerRef.current) {
      clearTimeout(scanFocusTimerRef.current);
      scanFocusTimerRef.current = null;
    }
  }, []);

  const isScannerTemporarilySuspended = useCallback(
    () => scannerSuspendUntilRef.current > Date.now(),
    []
  );

  const focusScanInput = useCallback(() => {
    const input = scanInputRef.current;
    if (
      !input ||
      !scannerAssistEnabled ||
      cameraOpen ||
      isScannerTemporarilySuspended()
    )
      return;
    input.focus();
    input.select();
  }, [cameraOpen, isScannerTemporarilySuspended, scannerAssistEnabled]);

  const scheduleScanFocus = useCallback(
    (delay = 90) => {
      if (!scannerAssistEnabled) return;
      if (isScannerTemporarilySuspended()) return;
      if (scanFocusTimerRef.current) {
        clearTimeout(scanFocusTimerRef.current);
      }
      scanFocusTimerRef.current = setTimeout(() => {
        if (cameraOpen || isScannerTemporarilySuspended()) return;
        const active = document.activeElement as Element | null;
        if (active && active !== document.body && isEditableElement(active)) {
          return;
        }
        focusScanInput();
      }, delay);
    },
    [cameraOpen, focusScanInput, isScannerTemporarilySuspended, scannerAssistEnabled]
  );

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleScannerSuspend = (event: Event) => {
      const detail = (event as CustomEvent<ScannerSuspendDetail>).detail;
      if (detail?.shopId && detail.shopId !== shopId) return;

      scannerSuspendUntilRef.current = Date.now() + Math.max(detail?.ms ?? 0, 600);
      clearScanTimers();

      if (document.activeElement === scanInputRef.current) {
        scanInputRef.current?.blur();
      }
    };

    window.addEventListener("pos-scanner-suspend", handleScannerSuspend as EventListener);
    return () => {
      window.removeEventListener(
        "pos-scanner-suspend",
        handleScannerSuspend as EventListener
      );
    };
  }, [clearScanTimers, shopId]);

  useEffect(() => {
    if (typeof window === "undefined" || !scannerAssistEnabled) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (target === scanInputRef.current) return;
      if (scanInputRef.current?.contains(target)) return;
      if (target.closest("[data-scanner-allow-focus='true']")) return;

      scannerSuspendUntilRef.current =
        Date.now() + SCANNER_INTERACTION_PAUSE_MS;
      clearScanTimers();

      if (document.activeElement === scanInputRef.current) {
        scanInputRef.current?.blur();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [clearScanTimers, scannerAssistEnabled]);

  useEffect(() => {
    if (scannerAssistEnabled) return;
    clearScanTimers();
    setScanCode("");
    setScanFeedback(null);
    if (cameraOpen) {
      setCameraOpen(false);
    }
    stopCamera();
  }, [cameraOpen, clearScanTimers, scannerAssistEnabled, stopCamera]);

  useEffect(() => {
    cameraContinuousRef.current = cameraContinuousMode;
  }, [cameraContinuousMode]);

  useEffect(() => {
    if (!cameraOpen) {
      stopCamera();
    }
  }, [cameraOpen, stopCamera]);

  useEffect(() => {
    return () => {
      clearScanTimers();
      if (recentlyAddedTimeoutRef.current) {
        clearTimeout(recentlyAddedTimeoutRef.current);
      }
      if (cooldownTimeoutRef.current) {
        clearTimeout(cooldownTimeoutRef.current);
      }
    };
  }, [clearScanTimers]);

  const bumpUsage = useCallback((productId: string) => {
    setUsage((prev) => {
      const next = {
        ...prev,
        [productId]: {
          count: (prev[productId]?.count ?? 0) + 1,
          lastUsed: Date.now(),
          favorite: prev[productId]?.favorite || false,
        },
      };
      return next;
    });
  }, []);

  const productsWithCategory = useMemo<EnrichedProduct[]>(
    () =>
      products.map((p) => ({ ...p, category: normalizeCategory(p.category) })),
    [products]
  );

  const productById = useMemo(() => {
    const byId = new Map<string, EnrichedProduct>();
    productsWithCategory.forEach((p) => {
      byId.set(p.id, p);
    });
    return byId;
  }, [productsWithCategory]);

  const productByCode = useMemo(() => {
    const byCode = new Map<string, CodeLookupMatch>();
    productsWithCategory.forEach((p) => {
      const normalizedSku = normalizeCodeInput(p.sku || "");
      const normalizedBarcode = normalizeCodeInput(p.barcode || "");
      if (normalizedSku) byCode.set(normalizedSku, { product: p });
      if (normalizedBarcode) byCode.set(normalizedBarcode, { product: p });
      const variants = getActiveVariants(p);
      for (const variant of variants) {
        const variantSku = normalizeCodeInput(variant.sku || "");
        const variantBarcode = normalizeCodeInput(variant.barcode || "");
        if (variantSku) {
          byCode.set(variantSku, { product: p, variant });
        }
        if (variantBarcode) {
          byCode.set(variantBarcode, { product: p, variant });
        }
      }
    });
    return byCode;
  }, [productsWithCategory]);

  useEffect(() => {
    const availableIds = new Set(productsWithCategory.map((p) => p.id));
    const taken = new Set<string>();
    let seedIds: Array<string | null> = [];

    if (typeof window !== "undefined") {
      try {
        const stored = window.sessionStorage.getItem(quickSlotStorageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            seedIds = parsed.map((value) =>
              typeof value === "string" ? value : null
            );
          }
        }
      } catch {
        // ignore malformed session cache
      }
    }

    if (seedIds.length === 0) {
      seedIds = quickSlotIds;
    }

    const normalized: Array<string | null> = Array(QUICK_LIMIT).fill(null);
    for (let i = 0; i < QUICK_LIMIT; i += 1) {
      const id = seedIds[i];
      if (!id || taken.has(id) || !availableIds.has(id)) continue;
      normalized[i] = id;
      taken.add(id);
    }

    const fallbackIds = (buildQuickSlots(
      productsWithCategory,
      sessionUsageSnapshot,
      dbRankMap
    ).filter(Boolean) as EnrichedProduct[])
      .map((p) => p.id)
      .filter((id) => !taken.has(id));

    let fallbackIndex = 0;
    for (let i = 0; i < QUICK_LIMIT; i += 1) {
      if (normalized[i]) continue;
      if (fallbackIndex >= fallbackIds.length) break;
      normalized[i] = fallbackIds[fallbackIndex];
      taken.add(fallbackIds[fallbackIndex]);
      fallbackIndex += 1;
    }

    // Session seed/calculation is intentional here to keep quick slots fixed after mount.
    setQuickSlotIds((prev) =>
      areSlotIdsEqual(prev, normalized) ? prev : normalized
    );
    setQuickSlotsReady(true);
  }, [
    dbRankMap,
    productsWithCategory,
    quickSlotStorageKey,
    quickSlotIds,
    sessionUsageSnapshot,
  ]);

  useEffect(() => {
    if (!quickSlotsReady || typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        quickSlotStorageKey,
        JSON.stringify(quickSlotIds)
      );
    } catch {
      // ignore session storage failures
    }
  }, [quickSlotIds, quickSlotStorageKey, quickSlotsReady]);

  const quickSlots = useMemo(
    () => quickSlotIds.map((id) => (id ? productById.get(id) ?? null : null)),
    [quickSlotIds, productById]
  );

  const availableCategories = useMemo(() => {
    const counts: Record<string, number> = {};
    productsWithCategory.forEach((p) => {
      counts[p.category] = (counts[p.category] ?? 0) + 1;
    });

    const sortedCategories = Object.entries(counts).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    );

    return [
      { key: "all", label: "সব", count: productsWithCategory.length },
      ...sortedCategories.map(([key, count]) => ({
        key,
        label: formatCategoryLabel(key),
        count,
      })),
    ];
  }, [productsWithCategory]);

  const filteredByCategory = useMemo(
    () =>
      activeCategory === "all"
        ? productsWithCategory
        : productsWithCategory.filter((p) => p.category === activeCategory),
    [productsWithCategory, activeCategory]
  );

  const filteredByQuery = useMemo(() => {
    const foldedTerm = foldSearchText(debouncedQuery);
    const queryTokens = tokenizeSearchText(debouncedQuery);
    if (!foldedTerm) return filteredByCategory;

    const expandedTokenMap = new Map<string, string[]>();
    for (const token of queryTokens) {
      expandedTokenMap.set(token, expandAliasTokens(token));
    }

    return filteredByCategory.filter((p) => {
      const fields: string[] = [
        p.name,
        p.category,
        String(p.sku || ""),
        String(p.barcode || ""),
        String(p.storageLocation || ""),
      ];
      for (const variant of getActiveVariants(p)) {
        fields.push(
          String(variant.label || ""),
          String(variant.sku || ""),
          String(variant.barcode || ""),
          String(variant.storageLocation || "")
        );
      }

      const foldedFields = fields
        .map((field) => foldSearchText(field))
        .filter(Boolean);
      if (!foldedFields.length) return false;

      // Fast exact/substring path
      if (foldedFields.some((field) => field.includes(foldedTerm))) {
        return true;
      }

      const candidateTokens = foldedFields.flatMap((field) => field.split(" "));
      if (!candidateTokens.length) return false;

      // Fuzzy + alias path: every query token should match by token/alias.
      return queryTokens.every((token) => {
        const expanded = expandedTokenMap.get(token) || [token];
        return expanded.some((queryCandidate) => {
          if (
            foldedFields.some((field) => field.includes(queryCandidate))
          ) {
            return true;
          }
          return candidateTokens.some((candidateToken) =>
            isFuzzyTokenMatch(queryCandidate, candidateToken)
          );
        });
      });
    });
  }, [filteredByCategory, debouncedQuery]);

  const shouldSort = showAllProducts || debouncedQuery.trim().length > 0;
  const sortedResults = useMemo(() => {
    if (!shouldSort) return filteredByQuery;
    const term = debouncedQuery.trim().toLowerCase();

    // Build sort key cache for efficiency
    const sortKeyCache = new Map<
      string,
      [number, number, number, number, string]
    >();

    return filteredByQuery.slice().sort((a, b) => {
      // Get or compute sort keys for both products
      if (!sortKeyCache.has(a.id)) {
        const ua = usage[a.id] || {};
        sortKeyCache.set(a.id, [
          Number(ua.favorite || false),
          Number(term && a.name.toLowerCase().startsWith(term)),
          ua.count ?? 0,
          ua.lastUsed ?? 0,
          a.name,
        ]);
      }
      if (!sortKeyCache.has(b.id)) {
        const ub = usage[b.id] || {};
        sortKeyCache.set(b.id, [
          Number(ub.favorite || false),
          Number(term && b.name.toLowerCase().startsWith(term)),
          ub.count ?? 0,
          ub.lastUsed ?? 0,
          b.name,
        ]);
      }

      const [aFav, aStart, aCount, aRecency, aName] = sortKeyCache.get(a.id)!;
      const [bFav, bStart, bCount, bRecency, bName] = sortKeyCache.get(b.id)!;

      const favoriteDiff = bFav - aFav;
      if (favoriteDiff !== 0) return favoriteDiff;

      const startDiff = bStart - aStart;
      if (startDiff !== 0) return startDiff;

      const countDiff = bCount - aCount;
      if (countDiff !== 0) return countDiff;

      const recencyDiff = bRecency - aRecency;
      if (recencyDiff !== 0) return recencyDiff;

      return aName.localeCompare(bName);
    });
  }, [filteredByQuery, usage, debouncedQuery, shouldSort]);

  const smartSuggestions = useMemo(() => {
    if (debouncedQuery.trim()) return sortedResults.slice(0, 6);

    const quickIds = new Set(
      (quickSlots.filter(Boolean) as EnrichedProduct[]).map((p) => p.id)
    );

    const recent = filteredByCategory
      .filter((p) => usage[p.id]?.lastUsed)
      .sort(
        (a, b) => (usage[b.id]?.lastUsed ?? 0) - (usage[a.id]?.lastUsed ?? 0)
      )
      .slice(0, 6);

    if (recent.length > 0) return recent;
    const slotProducts = quickSlots.filter(Boolean) as EnrichedProduct[];
    return slotProducts.filter((p) => !quickIds.has(p.id)).slice(0, 6);
  }, [debouncedQuery, filteredByCategory, quickSlots, sortedResults, usage]);

  useEffect(() => {
    if (!showAllProducts) return;
    if (renderCount >= sortedResults.length) return;
    const cancel = scheduleIdle(() => {
      setRenderCount((prev) =>
        Math.min(prev + RENDER_BATCH, sortedResults.length)
      );
    });
    return () => cancel();
  }, [showAllProducts, renderCount, sortedResults.length]);

  const visibleResults = useMemo(
    () => sortedResults.slice(0, renderCount),
    [sortedResults, renderCount]
  );

  useEffect(() => {
    const scroller = categoryChipsRef.current;
    if (!showAllProducts || !scroller) {
      setShowCategoryOverflowCue(false);
      setCategoryScrollAtEnd(true);
      return;
    }

    const updateScrollCue = () => {
      const overflow = scroller.scrollWidth - scroller.clientWidth > 12;
      const atEnd =
        scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 8;
      setShowCategoryOverflowCue(overflow);
      setCategoryScrollAtEnd(!overflow || atEnd);
    };

    updateScrollCue();
    scroller.addEventListener("scroll", updateScrollCue, { passive: true });
    window.addEventListener("resize", updateScrollCue);

    return () => {
      scroller.removeEventListener("scroll", updateScrollCue);
      window.removeEventListener("resize", updateScrollCue);
    };
  }, [showAllProducts, availableCategories.length]);

  const addToCart = useCallback(
    (
      product: EnrichedProduct,
      variant?: ProductVariantOption,
      quantity = 1
    ) => {
      // Prevent double clicks within 300ms (ref-based, not state-based)
      const now = Date.now();
      if (now - lastAddRef.current < 300) return;
      lastAddRef.current = now;

      const productPrice = Number(variant?.sellPrice ?? product.sellPrice ?? 0);
      const itemKey = buildCartItemKey(product.id, variant?.id ?? null);
      const safeQuantity = Math.max(0.01, Number(quantity) || 1);

      add({
        itemKey,
        shopId,
        productId: product.id,
        variantId: variant?.id ?? null,
        variantLabel: variant?.label ?? null,
        name: buildCartItemName(product, variant),
        unitPrice: productPrice,
        baseUnit: product.baseUnit ?? null,
        trackSerialNumbers: product.trackSerialNumbers ?? false,
        qty: safeQuantity,
      });

      // If product requires serial numbers, notify parent to open serial picker
      if (product.trackSerialNumbers && onSerialRequired) {
        onSerialRequired(
          itemKey,
          product.id,
          buildCartItemName(product, variant),
          variant?.id ?? null,
          safeQuantity
        );
      }

      // UI feedback
      setCooldownProductId(itemKey);
      bumpUsage(product.id);
      setRecentlyAdded(itemKey);
      if (recentlyAddedTimeoutRef.current) {
        clearTimeout(recentlyAddedTimeoutRef.current);
      }
      if (cooldownTimeoutRef.current) {
        clearTimeout(cooldownTimeoutRef.current);
      }
      recentlyAddedTimeoutRef.current = setTimeout(
        () => setRecentlyAdded(null),
        450
      );
      cooldownTimeoutRef.current = setTimeout(
        () => setCooldownProductId(null),
        220
      );
    },
    [add, bumpUsage, setCooldownProductId, setRecentlyAdded, shopId, onSerialRequired]
  );

  const handleAddToCart = useCallback(
    (
      product: EnrichedProduct,
      variant?: ProductVariantOption,
      quantity = 1
    ) => {
      const safeQuantity = Math.max(0.01, Number(quantity) || 1);
      const remaining = getAvailableStockForSelection(product, cartItems, variant);
      const tracksStock = product.trackStock === true;

      if (tracksStock && remaining + 0.000001 < safeQuantity) {
        const message =
          remaining <= 0
            ? `${buildCartItemName(product, variant)} এর available stock নেই।`
            : `${buildCartItemName(product, variant)} এর মাত্র ${remaining.toFixed(2)} ${
                product.baseUnit || "টি"
              } available আছে। ${safeQuantity.toFixed(2)} যোগ করা যাবে না।`;
        setStockConfirm({ product, variant, quantity: safeQuantity, message });
        return;
      }

      addToCart(product, variant, safeQuantity);
    },
    [addToCart, cartItems]
  );

  const handleProductTap = useCallback(
    (product: EnrichedProduct) => {
      const variants = getActiveVariants(product);
      if (variants.length === 0) {
        handleAddToCart(product);
        return;
      }
      if (variants.length === 1) {
        handleAddToCart(product, variants[0]);
        return;
      }
      setVariantPicker({ product, quantity: 1 });
    },
    [handleAddToCart]
  );

  const lookupAndAddByCode = useCallback(
    (rawCode: string, source: "manual" | "camera" = "manual") => {
      if (!scannerAssistEnabled) return false;
      const normalizedCode = normalizeCodeInput(rawCode);
      if (!normalizedCode) return false;
      const duplicateWindowMs =
        source === "camera"
          ? CAMERA_DUPLICATE_WINDOW_MS
          : MANUAL_DUPLICATE_WINDOW_MS;
      if (
        isRapidDuplicateScan(
          lastProcessedScanRef.current,
          normalizedCode,
          duplicateWindowMs
        )
      ) {
        setScanFeedback({
          type: "error",
          message: `একই কোড ${normalizedCode} খুব দ্রুত দুইবার এসেছে, duplicate scan ignore করা হয়েছে।`,
        });
        playScannerFeedbackTone("error");
        return false;
      }

      const match = productByCode.get(normalizedCode);
      if (!match) {
        setScanFeedback({
          type: "error",
          message: `কোড ${normalizedCode} পাওয়া যায়নি`,
        });
        playScannerFeedbackTone("error");
        return false;
      }

      lastProcessedScanRef.current = { code: normalizedCode, at: Date.now() };
      const selectedVariant =
        match.variant ?? getActiveVariants(match.product)[0] ?? undefined;
      handleAddToCart(match.product, selectedVariant);
      setScanFeedback({
        type: "success",
        message:
          source === "camera"
            ? `${buildCartItemName(match.product, selectedVariant)} ক্যামেরা স্ক্যানে যোগ হয়েছে`
            : `${buildCartItemName(match.product, selectedVariant)} কার্টে যোগ হয়েছে`,
      });
      playScannerFeedbackTone("success");
      return true;
    },
    [handleAddToCart, productByCode, scannerAssistEnabled]
  );

  const handleScanLookup = useCallback(() => {
    if (!scannerAssistEnabled) return;
    if (scanIdleTimerRef.current) {
      clearTimeout(scanIdleTimerRef.current);
      scanIdleTimerRef.current = null;
    }
    const normalizedCode = normalizeCodeInput(scanCode);
    if (!normalizedCode) return;
    const ok = lookupAndAddByCode(normalizedCode, "manual");
    if (!ok) return;
    setScanCode("");
    focusScanInput();
  }, [focusScanInput, scanCode, lookupAndAddByCode, scannerAssistEnabled]);

  const toggleCameraTorch = useCallback(async () => {
    const track = cameraTrackRef.current as (MediaStreamTrack & {
      applyConstraints?: (constraints: MediaTrackConstraints) => Promise<void>;
    }) | null;
    if (!track || typeof track.applyConstraints !== "function") return;

    const next = !cameraTorchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as any],
      });
      setCameraTorchOn(next);
    } catch {
      setCameraError("ফ্ল্যাশ চালু করা যায়নি।");
    }
  }, [cameraTorchOn]);

  const openCameraScanner = useCallback(async () => {
    if (!scannerAssistEnabled) return;
    if (typeof window === "undefined") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      const message =
        "এই ডিভাইসে ক্যামেরা সাপোর্ট নেই। external barcode scanner বা scan box ব্যবহার করুন।";
      setCameraError(message);
      setScanFeedback({ type: "error", message });
      return;
    }

    const BarcodeDetectorCtor = (window as any).BarcodeDetector;
    if (!BarcodeDetectorCtor) {
      const message =
        "এই ব্রাউজারে live camera barcode scan সাপোর্ট নেই। Chrome/Edge latest ব্যবহার করুন, না হলে external scanner দিয়ে scan box-এ code দিন।";
      setCameraError(message);
      setScanFeedback({ type: "error", message });
      return;
    }

    setCameraOpen(true);
    setCameraError(null);
    setCameraReady(false);
    lastCameraHitRef.current = null;
    stopCamera();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      cameraStreamRef.current = stream;
      cameraTrackRef.current = stream.getVideoTracks()[0] ?? null;

      const trackAny = cameraTrackRef.current as
        | (MediaStreamTrack & { getCapabilities?: () => any })
        | null;
      const capabilities = (trackAny?.getCapabilities?.() as any) ?? null;
      const torchSupported = Boolean(capabilities?.torch);
      setCameraTorchSupported(torchSupported);
      setCameraTorchOn(false);

      const video = cameraVideoRef.current;
      if (!video) {
        throw new Error("ভিডিও এলিমেন্ট পাওয়া যায়নি");
      }
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play();

      try {
        cameraDetectorRef.current = new BarcodeDetectorCtor({
          formats: [
            "ean_13",
            "ean_8",
            "upc_a",
            "upc_e",
            "code_128",
            "code_39",
            "qr_code",
          ],
        });
      } catch {
        cameraDetectorRef.current = new BarcodeDetectorCtor();
      }

      setCameraReady(true);

      const scanLoop = async () => {
        const detector = cameraDetectorRef.current;
        const videoEl = cameraVideoRef.current;
        if (!detector || !videoEl || !cameraStreamRef.current) return;

        try {
          if (videoEl.readyState >= 2) {
            const barcodes = await detector.detect(videoEl);
            const rawCode = barcodes?.[0]?.rawValue;
            const normalized = normalizeCodeInput(rawCode || "");
            if (normalized) {
              const now = Date.now();
              const last = lastCameraHitRef.current;
              const duplicateRecent = isRapidDuplicateScan(
                last,
                normalized,
                CAMERA_DUPLICATE_WINDOW_MS,
                now
              );

              if (!duplicateRecent) {
                lastCameraHitRef.current = { code: normalized, at: now };
                const ok = lookupAndAddByCode(normalized, "camera");
                if (ok) {
                  setScanCode(normalized);
                  if (typeof navigator.vibrate === "function") {
                    navigator.vibrate(40);
                  }
                  if (!cameraContinuousRef.current) {
                    setCameraOpen(false);
                    stopCamera();
                    return;
                  }
                }
              }
            }
          }
        } catch {
          // ignore per-frame detection errors
        }

        cameraScanTimerRef.current = setTimeout(scanLoop, 220);
      };

      cameraScanTimerRef.current = setTimeout(scanLoop, 220);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "ক্যামেরা চালু করা যায়নি";
      setCameraError(message);
      setScanFeedback({ type: "error", message });
      setCameraOpen(false);
      stopCamera();
    }
  }, [lookupAndAddByCode, scannerAssistEnabled, stopCamera]);

  useEffect(() => {
    if (!cameraOpen || typeof document === "undefined") return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [cameraOpen]);

  useEffect(() => {
    if (
      !canUseBarcodeScan ||
      !scannerAssistEnabled ||
      cameraOpen ||
      isScannerTemporarilySuspended()
    )
      return;
    scheduleScanFocus(140);
  }, [
    canUseBarcodeScan,
    cameraOpen,
    scannerAssistEnabled,
    scheduleScanFocus,
    isScannerTemporarilySuspended,
  ]);

  useEffect(() => {
    if (!scanFeedback) return;
    const id = setTimeout(() => setScanFeedback(null), 2200);
    return () => clearTimeout(id);
  }, [scanFeedback]);

  const clearVoiceAssist = useCallback(() => {
    setVoiceHeard("");
    setVoiceMatches([]);
  }, []);

  useEffect(() => {
    clearVoiceAssist();
    setVoiceError(null);
  }, [voiceMode, clearVoiceAssist]);

  const resolveVoiceQuery = useCallback(
    (alternatives: string[]) => {
      const normalizedAlternatives = dedupeStringList(alternatives);
      if (normalizedAlternatives.length === 0) {
        setVoiceHeard("");
        setVoiceMatches([]);
        return false;
      }

      const rankedMatches = rankVoiceProductMatches(
        normalizedAlternatives,
        productsWithCategory,
        usage
      );
      const heard = normalizedAlternatives[0] || "";
      setVoiceHeard(heard);
      setVoiceMatches(rankedMatches.slice(0, 3));
      setShowAllProducts(true);

      const top = rankedMatches[0];
      const second = rankedMatches[1];
      const hasHighConfidence =
        Boolean(top) &&
        (top.score >= 280 ||
          (top.score >= 220 && (!second || top.score - second.score >= 48)));

      if (hasHighConfidence && top) {
        setQuery(top.product.name);
        setVoiceError(null);
        return true;
      }

      setQuery(heard);
      return rankedMatches.length > 0;
    },
    [productsWithCategory, usage]
  );

  useEffect(() => {
    if (
      !canUseBarcodeScan ||
      !scannerAssistEnabled ||
      cameraOpen ||
      !scanCode ||
      isScannerTemporarilySuspended()
    )
      return;
    if (document.activeElement !== scanInputRef.current) return;
    const normalizedCode = normalizeCodeInput(scanCode);
    if (normalizedCode.length < 4) return;

    if (scanIdleTimerRef.current) {
      clearTimeout(scanIdleTimerRef.current);
    }

    scanIdleTimerRef.current = setTimeout(() => {
      if (document.activeElement !== scanInputRef.current) return;
      handleScanLookup();
    }, SCAN_IDLE_SUBMIT_MS);

    return () => {
      if (scanIdleTimerRef.current) {
        clearTimeout(scanIdleTimerRef.current);
        scanIdleTimerRef.current = null;
      }
    };
  }, [
    cameraOpen,
    canUseBarcodeScan,
    handleScanLookup,
    scanCode,
    scannerAssistEnabled,
    isScannerTemporarilySuspended,
  ]);

  const startVoice = () => {
    if (listening) return;
    const SpeechRecognitionImpl =
      typeof window !== "undefined"
        ? (window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition
        : null;

    if (!SpeechRecognitionImpl) {
      setVoiceError("ব্রাউজার মাইক্রোফোন সমর্থন দিচ্ছে না");
      return;
    }

    const runVoiceAttempt = (
      lang: string
    ): Promise<{ spoken: string | null; alternatives: string[]; errorCode: string | null }> =>
      new Promise((resolve) => {
        const recognition: SpeechRecognitionInstance = new SpeechRecognitionImpl();
        let settled = false;
        const finish = (
          result: {
            spoken: string | null;
            alternatives: string[];
            errorCode: string | null;
          }
        ) => {
          if (settled) return;
          settled = true;
          if (recognitionRef.current === recognition) {
            recognitionRef.current = null;
          }
          resolve(result);
        };

        recognition.lang = lang;
        recognition.interimResults = false;
        recognition.continuous = false;
        (recognition as any).maxAlternatives = 5;
        recognition.onerror = (e: any) => {
          const code = typeof e?.error === "string" ? e.error : "unknown";
          finish({ spoken: null, alternatives: [], errorCode: code });
        };
        recognition.onend = () => {
          finish({ spoken: null, alternatives: [], errorCode: null });
        };
        recognition.onresult = (event: any) => {
          const alternatives = Array.from(event?.results?.[0] || [])
            .map((choice: any) => normalizeVoiceTranscript(choice?.transcript || ""))
            .filter(Boolean);
          const normalizedAlternatives = dedupeStringList(alternatives);
          const normalizedSpoken = normalizedAlternatives[0] || "";
          finish({
            spoken: normalizedSpoken || null,
            alternatives: normalizedAlternatives,
            errorCode: null,
          });
        };

        recognitionRef.current = recognition;
        try {
          recognition.start();
        } catch {
          finish({ spoken: null, alternatives: [], errorCode: "start-failed" });
        }
      });

    const blockedCodes = new Set(["not-allowed", "denied", "service-not-allowed"]);
    const userStoppedCodes = new Set(["aborted"]);
    const tryFallback = (errorCode: string | null) =>
      !errorCode || (!blockedCodes.has(errorCode) && !userStoppedCodes.has(errorCode));

    voiceCancelRequestedRef.current = false;
    setVoiceError(null);
    clearVoiceAssist();
    setListening(true);
    void (async () => {
      const result = await runVoiceAttempt(VOICE_LANG_BY_MODE[voiceMode]);
      if (voiceCancelRequestedRef.current || userStoppedCodes.has(result.errorCode || "")) {
        setListening(false);
        return;
      }

      const spoken = result.spoken;
      if (spoken) {
        resolveVoiceQuery(result.alternatives.length ? result.alternatives : [spoken]);
        setListening(false);
        return;
      }

      if (blockedCodes.has(result.errorCode || "")) {
        setVoiceError("মাইক্রোফোন অ্যাক্সেস পাওয়া যায়নি");
        setListening(false);
        return;
      }

      if (!tryFallback(result.errorCode)) {
        setVoiceError("ভয়েস সার্চ ব্যর্থ হয়েছে। পরে আবার চেষ্টা করুন।");
        setListening(false);
        return;
      }

      setVoiceError(
        voiceMode === "bn"
          ? "বাংলায় আবার পরিষ্কার করে বলুন।"
          : "Please say the product name clearly in English."
      );
      setListening(false);
    })();
  };

  const stopVoice = () => {
    voiceCancelRequestedRef.current = true;
    recognitionRef.current?.abort?.();
    recognitionRef.current?.stop?.();
    clearVoiceAssist();
    setListening(false);
  };
  const voiceErrorText = voiceError ? `(${voiceError})` : "";
  const voiceHint = listening
    ? voiceMode === "bn"
      ? "শুনছে... বাংলায় পণ্যের নাম বলুন।"
      : "Listening... say the product name in English."
    : voiceReady
    ? voiceMode === "bn"
      ? "বাংলা mode-এ পণ্যের নাম বলুন।"
      : "English mode-এ product name বলুন।"
    : "ব্রাউজার মাইক্রোফোন সমর্থন দিচ্ছে না";

  const renderProductButton = (product: EnrichedProduct) => (
    <ProductButton
      key={product.id}
      product={product}
      onAdd={handleProductTap}
      isRecentlyAdded={recentlyAdded?.startsWith(`${product.id}:`) || recentlyAdded === product.id}
      isCooldown={cooldownProductId?.startsWith(`${product.id}:`) || cooldownProductId === product.id}
    />
  );

  const renderProductListButton = (product: EnrichedProduct) => (
    <ProductListButton
      key={`list-${product.id}`}
      product={product}
      onAdd={handleProductTap}
      isRecentlyAdded={recentlyAdded?.startsWith(`${product.id}:`) || recentlyAdded === product.id}
      isCooldown={cooldownProductId?.startsWith(`${product.id}:`) || cooldownProductId === product.id}
    />
  );

  const renderBrowseProduct = (product: EnrichedProduct) =>
    productViewMode === "list"
      ? renderProductListButton(product)
      : renderProductButton(product);

  const renderQuickSlot = (slot: QuickSlot, index: number) => {
    if (!slot) return renderPlaceholderSlot(index);
    return (
      <ProductButton
        key={`quick-slot-${index}`}
        product={slot}
        onAdd={handleProductTap}
        isRecentlyAdded={recentlyAdded?.startsWith(`${slot.id}:`) || recentlyAdded === slot.id}
        isCooldown={cooldownProductId?.startsWith(`${slot.id}:`) || cooldownProductId === slot.id}
      />
    );
  };

  const renderPlaceholderSlot = (index: number) => (
    <div
      key={`slot-${index}`}
      className="w-full h-full min-h-[140px] rounded-2xl border border-dashed border-border bg-muted/30 flex items-center justify-center text-xs text-muted-foreground"
    >
      ফিক্সড স্লট
    </div>
  );

  const mobileScannerSummary = query.trim()
    ? `খোঁজ: ${query.trim()}`
    : inputMode === "scanner"
    ? "Scanner mode চালু"
    : "Search mode চালু";
  const searchModePanel = (
    <>
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <input
            className="w-full h-10 rounded-xl border border-border bg-card/80 pl-10 pr-36 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 sm:pr-44"
            placeholder="পণ্য খুঁজুন (নাম/কোড)..."
            value={query}
            onFocus={() => setShowAllProducts(true)}
            onChange={(e) => {
              clearVoiceAssist();
              setQuery(e.target.value);
            }}
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-base">
            🔍
          </span>
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            <div className="inline-flex items-center rounded-full border border-border bg-card/90 p-0.5 shadow-sm">
              <button
                type="button"
                onClick={() => setVoiceMode("bn")}
                aria-pressed={voiceMode === "bn"}
                className={`inline-flex h-7 items-center rounded-full px-2 text-[11px] font-semibold transition sm:px-2.5 ${
                  voiceMode === "bn"
                    ? "bg-primary-soft text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                BN
              </button>
              <button
                type="button"
                onClick={() => setVoiceMode("en")}
                aria-pressed={voiceMode === "en"}
                className={`inline-flex h-7 items-center rounded-full px-2 text-[11px] font-semibold transition sm:px-2.5 ${
                  voiceMode === "en"
                    ? "bg-primary-soft text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                EN
              </button>
            </div>
            {query ? (
              <button
                type="button"
                onClick={() => {
                  clearVoiceAssist();
                  setQuery("");
                }}
                aria-label="সার্চ ক্লিয়ার করুন"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground text-sm hover:bg-muted"
              >
                ✕
              </button>
            ) : null}
            <button
              type="button"
              onClick={listening ? stopVoice : startVoice}
              disabled={!voiceReady}
              aria-label={listening ? "ভয়েস বন্ধ করুন" : "ভয়েস ইনপুট চালু করুন"}
              className={`inline-flex h-8 items-center justify-center rounded-lg border px-2.5 text-sm font-semibold transition ${
                listening
                  ? "bg-primary-soft text-primary border-primary/40 animate-pulse"
                  : "bg-primary-soft text-primary border-primary/30 active:scale-95"
              } ${!voiceReady ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              {listening ? "🔴" : "🎤"}
            </button>
          </div>
        </div>
      </div>
      {listening || voiceErrorText || !voiceReady ? (
        <div className="flex flex-wrap items-center gap-2">
          {listening ? (
            <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary">
              {voiceMode === "bn" ? "BN শুনছে..." : "EN listening..."}
            </span>
          ) : null}
          {voiceErrorText ? (
            <span className="inline-flex items-center rounded-full border border-danger/25 bg-danger/10 px-2.5 py-1 text-[11px] font-semibold text-danger">
              {voiceMode === "bn" ? "আবার বলুন" : "Try again"}
            </span>
          ) : null}
          {!voiceReady ? (
            <span className="text-[11px] text-danger">মাইক্রোফোন সাপোর্ট নেই</span>
          ) : null}
        </div>
      ) : null}
      {voiceHeard ? (
        <div className="rounded-xl border border-primary/15 bg-primary-soft/20 p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex max-w-full items-center rounded-full border border-primary/20 bg-card px-2.5 py-1 text-[11px] font-semibold text-primary">
              <span className="truncate">শুনেছে: {voiceHeard}</span>
            </span>
            {voiceMatches.length > 0 ? (
              voiceMatches.map((match) => (
                <button
                  key={`${match.product.id}-${match.matchKind}`}
                  type="button"
                  onClick={() => {
                    setQuery(match.product.name);
                    setShowAllProducts(true);
                  }}
                  className="inline-flex items-center rounded-full border border-primary/25 bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary/45 hover:text-primary"
                >
                  {match.product.name}
                </button>
              ))
            ) : (
              <span className="text-[11px] text-muted-foreground">
                match পাওয়া যায়নি
              </span>
            )}
          </div>
        </div>
      ) : null}
      {canUseBarcodeScan ? (
        <p className="hidden rounded-lg border border-primary/20 bg-primary-soft/30 px-3 py-2 text-[11px] text-muted-foreground sm:block">
          দ্রুত স্ক্যান করতে চাইলে উপরের <strong>Scanner</strong> mode-এ যান।
        </p>
      ) : null}
    </>
  );

  return (
    <div className="space-y-5">
      {/* Search + state toggles */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-muted/40 p-2.5 sm:p-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)] space-y-2.5">
        {canUseBarcodeScan ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-foreground sm:text-xs">
                  ইনপুট মোড
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {mobileScannerSummary}
                </p>
              </div>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                  inputMode === "scanner"
                    ? "border-success/30 bg-success-soft text-success"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {inputMode === "scanner" ? "স্ক্যান প্রস্তুত" : "খোঁজার জন্য প্রস্তুত"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-border/80 bg-card/70 p-1">
              <button
                type="button"
                onClick={() => setInputMode("search")}
                aria-pressed={inputMode === "search"}
                className={`h-9 rounded-lg border text-sm font-semibold transition ${
                  inputMode === "search"
                    ? "border-primary/40 bg-primary-soft text-primary shadow-sm"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                🔎 খুঁজুন
              </button>
              <button
                type="button"
                onClick={() => setInputMode("scanner")}
                aria-pressed={inputMode === "scanner"}
                className={`h-9 rounded-lg border text-sm font-semibold transition ${
                  inputMode === "scanner"
                    ? "border-success/40 bg-success-soft text-success shadow-sm"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                📷 স্ক্যানার
              </button>
            </div>

            {inputMode === "search" ? (
              searchModePanel
            ) : (
              <div className="rounded-xl border border-success/20 bg-success-soft/35 p-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-foreground">স্ক্যানার মোড</p>
                    <p className="text-[11px] text-muted-foreground">
                      স্ক্যান ইনপুট চালু আছে, search typing pause করা আছে
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInputMode("search")}
                    className="inline-flex h-8 items-center justify-center rounded-full border border-border bg-card px-3 text-[11px] font-semibold text-muted-foreground"
                  >
                    Exit Scanner
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    ref={scanInputRef}
                    type="text"
                    inputMode="text"
                    autoCapitalize="off"
                    autoCorrect="off"
                    autoComplete="off"
                    value={scanCode}
                    onChange={(e) => setScanCode(normalizeCodeInput(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      handleScanLookup();
                    }}
                    onBlur={(e) => {
                      if (isScannerTemporarilySuspended()) return;
                      const nextTarget = e.relatedTarget as Element | null;
                      if (
                        nextTarget &&
                        nextTarget !== document.body &&
                        nextTarget !== scanInputRef.current
                      ) {
                        return;
                      }
                      scheduleScanFocus();
                    }}
                    data-scanner-allow-focus="true"
                    className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-success/30"
                    placeholder="Barcode / SKU স্ক্যান করুন"
                  />
                  <button
                    type="button"
                    onClick={handleScanLookup}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-success/40 bg-success-soft px-3 text-xs font-semibold text-success"
                  >
                    Scan যোগ
                  </button>
                  <button
                    type="button"
                    onClick={openCameraScanner}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-success/40 bg-card px-3 text-xs font-semibold text-success"
                  >
                    Camera
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={focusScanInput}
                    className="inline-flex h-8 items-center rounded-full border border-border bg-card px-3 text-[11px] font-semibold text-foreground hover:bg-muted"
                  >
                    External scanner ready
                  </button>
                  <span className="text-[11px] text-muted-foreground">
                    scan box-এ cursor থাকলে handheld scanner keyboard-এর মতো code পাঠাবে
                  </span>
                </div>
                <input
                  disabled
                  value=""
                  placeholder="Search input এখন paused (Search mode-এ ফিরলে টাইপ করুন)"
                  className="mt-2 h-9 w-full rounded-lg border border-border bg-card/70 px-3 text-xs text-muted-foreground opacity-80"
                />
                <p
                  className={`mt-1 text-xs ${
                    scanFeedback?.type === "error"
                      ? "text-danger"
                      : "text-muted-foreground"
                  }`}
                >
                  {scanFeedback?.message ||
                    "Enter ছাড়াও scanner idle হলেই auto add হবে, beep দিয়ে success বোঝাবে।"}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Camera না চললে scan box-এ cursor রেখে external scanner trigger করুন। accidental duplicate খুব দ্রুত এলে ignore হবে।
                </p>
              </div>
            )}
          </>
        ) : (
          searchModePanel
        )}
      </div>

      {/* Quick buttons: visible only when not searching to prioritize results */}
      {query.trim().length === 0 && (
        <div className="space-y-3 bg-gradient-to-br from-card via-card to-muted/40 border border-border rounded-2xl p-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
              ⚡ দ্রুত বিক্রি
            </h3>
            <div className="inline-flex items-center rounded-full border border-border bg-card/90 p-0.5 shadow-sm">
              <button
                type="button"
                onClick={() => setProductViewMode("grid")}
                aria-label="Grid view"
                aria-pressed={productViewMode === "grid"}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition ${
                  productViewMode === "grid"
                    ? "bg-primary-soft text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setProductViewMode("list")}
                aria-label="List view"
                aria-pressed={productViewMode === "list"}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition ${
                  productViewMode === "list"
                    ? "bg-primary-soft text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
          {productViewMode === "list" ? (
            <div className="space-y-2 px-1 pb-1">
              {(quickSlots.filter(Boolean) as EnrichedProduct[]).map((product) =>
                renderProductListButton(product)
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-3.5 px-1 pb-1">
              {quickSlots.map((slot, idx) => renderQuickSlot(slot, idx))}
            </div>
          )}
        </div>
      )}

      {query.trim().length > 0 && (
        <div className="space-y-3 bg-gradient-to-br from-card via-card to-muted/40 border border-border rounded-2xl p-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
              স্মার্ট সাজেশন
            </h3>
            <span className="text-xs text-muted-foreground">
              শুধু সার্চ/ফাঁকা কার্টে হিন্ট দেখানো হচ্ছে
            </span>
          </div>
          {smartSuggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">কোনো সাজেশন নেই।</p>
          ) : (
            <div
              className={
                productViewMode === "list"
                  ? "space-y-2 px-1 pb-1"
                  : "grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-3.5 px-1 pb-1 text-sm"
              }
            >
              {smartSuggestions.map((p) => renderBrowseProduct(p))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3 bg-gradient-to-br from-card via-card to-muted/40 border border-border rounded-2xl p-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
              সব পণ্য
            </h3>
            <p className="hidden text-[11px] text-muted-foreground sm:block">
              অটো সাজানো
            </p>
          </div>
          {showAllProducts ? (
            <div className="inline-flex items-center rounded-full border border-border bg-card/90 p-0.5 shadow-sm">
              <button
                type="button"
                onClick={() => setProductViewMode("grid")}
                aria-label="Grid view"
                aria-pressed={productViewMode === "grid"}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition ${
                  productViewMode === "grid"
                    ? "bg-primary-soft text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setProductViewMode("list")}
                aria-label="List view"
                aria-pressed={productViewMode === "list"}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition ${
                  productViewMode === "list"
                    ? "bg-primary-soft text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="inline-flex h-8 shrink-0 items-center rounded-full border border-primary/30 bg-primary-soft/20 px-3 text-xs font-semibold text-primary hover:border-primary/50"
              onClick={() => setShowAllProducts(true)}
            >
              সব পণ্য দেখুন
            </button>
          )}
        </div>
        {showAllProducts ? (
          <>
            <div className="bg-muted/40 border border-border rounded-2xl p-2.5">
              <div className="relative">
                <div
                  ref={categoryChipsRef}
                  className="flex gap-2 overflow-x-auto no-scrollbar whitespace-nowrap pr-12 sm:flex-wrap sm:overflow-visible sm:whitespace-normal sm:pr-1"
                >
                  {availableCategories.map((cat) => (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => {
                        setActiveCategory(cat.key);
                        setShowAllProducts(true);
                      }}
                      className={`shrink-0 px-3 py-2 rounded-full border text-sm transition-colors ${
                        activeCategory === cat.key
                          ? "bg-primary-soft border-primary/40 text-primary"
                          : "bg-card border-border text-foreground hover:border-primary/30"
                      }`}
                    >
                      {cat.label}
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({cat.count})
                      </span>
                    </button>
                  ))}
                </div>
                {showCategoryOverflowCue && !categoryScrollAtEnd ? (
                  <>
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-14 bg-gradient-to-l from-muted/95 via-muted/70 to-transparent sm:hidden" />
                    <div className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 rounded-full border border-border bg-card/90 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground shadow-sm sm:hidden">
                      আরও →
                    </div>
                  </>
                ) : null}
              </div>
            </div>
            <div
              className={`px-1 pb-1 max-h-[520px] overflow-y-auto pr-2 ${
                productViewMode === "list"
                  ? "space-y-2"
                  : "grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-3.5"
              }`}
            >
              {visibleResults.length === 0 ? (
                <p
                  className={`text-center text-muted-foreground py-8 ${
                    productViewMode === "list" ? "" : "col-span-full"
                  }`}
                >
                  আপনার ফিল্টারে কোনো পণ্য নেই।
                </p>
              ) : (
                visibleResults.map((p) => renderBrowseProduct(p))
              )}
            </div>
            {renderCount < sortedResults.length ? (
              <p className="text-xs text-muted-foreground text-center">
                আরও {sortedResults.length - renderCount} টি পণ্য লোড হচ্ছে...
              </p>
            ) : null}
          </>
        ) : null}
      </div>
      <ConfirmDialog
        open={Boolean(stockConfirm)}
        title="স্টক সতর্কতা"
        description={stockConfirm?.message}
        confirmLabel={stockConfirm?.allowOverride ? "যোগ করুন" : "ঠিক আছে"}
        cancelLabel={stockConfirm?.allowOverride ? "বাতিল" : "বন্ধ"}
        onOpenChange={(open) => {
          if (!open) setStockConfirm(null);
        }}
        onConfirm={() => {
          if (!stockConfirm) return;
          const { product, variant, quantity, allowOverride } = stockConfirm;
          setStockConfirm(null);
          if (allowOverride) {
            addToCart(product, variant, quantity);
          }
        }}
      />
      {variantPicker ? (
        <div className="fixed inset-0 z-[65] bg-black/40 backdrop-blur-[1px]">
          <div className="mx-auto flex h-full w-full max-w-md items-end p-2 sm:items-center sm:p-3">
            <div className="flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-2xl border border-border bg-card p-2.5 shadow-[0_20px_45px_rgba(15,23,42,0.25)] sm:max-h-[calc(100dvh-2rem)] sm:p-3">
              <div className="mb-2 flex shrink-0 items-start justify-between gap-2">
                <div>
                  <p className="text-base font-bold leading-tight text-foreground">
                    সাইজ / ধরন বাছাই করুন
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {variantPicker.product.name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setVariantPicker(null)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:bg-muted"
                >
                  ✕
                </button>
              </div>
              <div className="mb-2 flex shrink-0 items-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-2 py-2">
                <p className="shrink-0 text-[11px] font-semibold text-muted-foreground">
                  Qty
                </p>
                <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={variantPicker.quantity <= 0.01}
                    onClick={() =>
                      setVariantPicker((current) =>
                        current
                          ? { ...current, quantity: Math.max(0.01, current.quantity - 1) }
                          : current
                      )
                    }
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-sm font-bold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="পরিমাণ কমান"
                  >
                    −
                  </button>
                  <div className="min-w-0 flex-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0.01"
                      max={
                        Number.isFinite(variantPickerMaxAvailable)
                          ? Math.max(0.01, Number(variantPickerMaxAvailable.toFixed(2)))
                          : undefined
                      }
                      value={variantPicker.quantity}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setVariantPicker((current) =>
                          current
                            ? {
                                ...current,
                                quantity: Number.isFinite(val) && val > 0
                                  ? Number(
                                      (
                                        current.product.trackStock === true &&
                                        Number.isFinite(variantPickerMaxAvailable)
                                          ? Math.min(val, Math.max(0.01, variantPickerMaxAvailable))
                                          : val
                                      ).toFixed(2)
                                    )
                                  : 0.01,
                              }
                            : current
                        );
                      }}
                      className="h-9 w-full min-w-[84px] rounded-xl border border-primary/20 bg-primary-soft px-2 py-1 text-center text-sm font-bold text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={
                      variantPicker.product.trackStock === true &&
                      Number.isFinite(variantPickerMaxAvailable) &&
                      variantPicker.quantity >= variantPickerMaxAvailable
                    }
                    onClick={() =>
                      setVariantPicker((current) =>
                        current
                          ? {
                              ...current,
                              quantity: Math.min(
                                current.product.trackStock === true &&
                                  Number.isFinite(variantPickerMaxAvailable)
                                  ? Math.max(0.01, variantPickerMaxAvailable)
                                  : 999,
                                current.quantity + 1
                              ),
                            }
                          : current
                      )
                    }
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-sm font-bold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="পরিমাণ বাড়ান"
                  >
                    +
                  </button>
                </div>
              </div>
              {variantPicker.product.trackStock === true ? (
                <div className="mb-2 shrink-0 rounded-xl border border-border/70 bg-card px-2.5 py-1.5 text-[11px]">
                  {variantPickerQuantityWarning ? (
                    <p className="font-semibold text-danger">{variantPickerQuantityWarning}</p>
                  ) : (
                    <p className="text-muted-foreground">
                      {variantPickerHasAnyAvailable
                        ? `এই quantity-তে যেসব variant-এর enough stock আছে, সেগুলোই বাছাই করা যাবে। সর্বোচ্চ ${
                            Number.isFinite(variantPickerMaxAvailable)
                              ? variantPickerMaxAvailable.toFixed(2)
                              : "∞"
                          } ${variantPicker.product.baseUnit || "টি"} পর্যন্ত যোগ করা যাবে।`
                        : "সব variant-এর available stock শেষ।"}
                    </p>
                  )}
                </div>
              ) : null}
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5 pb-[max(env(safe-area-inset-bottom),0.25rem)]">
                {getActiveVariants(variantPicker.product).map((variant) => {
                  const tracksStock = variantPicker.product.trackStock === true;
                  const unit = variantPicker.product.baseUnit || "";
                  const vStock = Number(variant.stockQty ?? 0);
                  const availableStock = getAvailableStockForSelection(
                    variantPicker.product,
                    cartItems,
                    variant
                  );
                  const outOfStock = tracksStock && availableStock <= 0;
                  const insufficientForSelectedQty =
                    tracksStock &&
                    availableStock > 0 &&
                    variantPicker.quantity > availableStock + 0.000001;
                  const toneClasses = tracksStock
                    ? getStockToneClasses(availableStock)
                    : null;
                  const stockBadgeClass = toneClasses
                    ? toneClasses.badge
                    : "bg-muted text-muted-foreground border border-border/60";
                  const stockLabel = buildVariantStockLabel(
                    availableStock,
                    unit,
                    tracksStock
                  );
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      disabled={outOfStock || insufficientForSelectedQty}
                      onClick={() => {
                        handleAddToCart(
                          variantPicker.product,
                          variant,
                          variantPicker.quantity
                        );
                        setVariantPicker(null);
                      }}
                      className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                        outOfStock || insufficientForSelectedQty
                          ? "border-border/50 bg-muted/40 cursor-not-allowed"
                          : "border-border bg-card hover:border-primary/35 hover:bg-primary-soft/15"
                      }`}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className={`min-w-0 break-words pr-1 text-sm font-semibold ${outOfStock || insufficientForSelectedQty ? "text-muted-foreground" : "text-foreground"}`}>
                          {variant.label}
                        </span>
                        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
                          {tracksStock && insufficientForSelectedQty ? (
                            <span className="inline-flex items-center rounded-full border border-warning/25 bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">
                              সর্বোচ্চ {availableStock.toFixed(2)}
                            </span>
                          ) : null}
                          {tracksStock && (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${stockBadgeClass}`}>
                              {stockLabel}
                            </span>
                          )}
                          {!outOfStock && !insufficientForSelectedQty && (
                            <span className="text-sm font-bold text-foreground">
                              <span className="text-muted-foreground">৳</span>{" "}
                              {variant.sellPrice}
                            </span>
                          )}
                        </div>
                      </div>
                      {variant.sku || variant.barcode ? (
                        <p className="mt-1 break-all text-[11px] text-muted-foreground">
                          {variant.sku ? `SKU: ${variant.sku}` : ""}{" "}
                          {variant.barcode ? `বারকোড: ${variant.barcode}` : ""}
                        </p>
                      ) : null}
                      {variant.storageLocation ? (
                        <p className="mt-1 text-[11px] font-medium text-primary">
                          📍 {variant.storageLocation}
                        </p>
                      ) : variantPicker.product.storageLocation ? (
                        <p className="mt-1 text-[11px] font-medium text-primary">
                          📍 {variantPicker.product.storageLocation}
                        </p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {cameraOpen ? (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm">
          <div className="mx-auto flex h-full w-full max-w-md flex-col px-4 py-4">
            <div className="mb-3 flex items-center justify-between rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-white">
              <div>
                <p className="text-sm font-semibold">ক্যামেরা স্ক্যান</p>
                <p className="text-[11px] text-white/70">
                  বারকোড ফ্রেমে আনুন, auto detect হবে
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCameraOpen(false);
                  stopCamera();
                }}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-white/30 bg-white/10 px-3 text-xs font-semibold"
              >
                বন্ধ করুন
              </button>
            </div>

            <div className="relative flex-1 overflow-hidden rounded-2xl border border-white/20 bg-black">
              <video
                ref={cameraVideoRef}
                className="h-full w-full object-cover"
                autoPlay
                muted
                playsInline
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-52 w-72 max-w-[85%] rounded-2xl border-2 border-emerald-300/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.30)]" />
              </div>
            </div>

            <div className="mt-3 space-y-2 rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-white">
              <div className="flex items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={cameraContinuousMode}
                    onChange={(e) => setCameraContinuousMode(e.target.checked)}
                    className="h-4 w-4 rounded border-white/40 bg-transparent"
                  />
                  টানা স্ক্যান
                </label>
                <button
                  type="button"
                  onClick={toggleCameraTorch}
                  disabled={!cameraTorchSupported}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-white/30 bg-white/10 px-3 text-xs font-semibold disabled:opacity-50"
                >
                  {cameraTorchOn ? "লাইট বন্ধ" : "লাইট চালু"}
                </button>
              </div>
              <p className="text-[11px] text-white/75">
                {cameraReady
                  ? "Detected হলে vibration হবে এবং আইটেম cart-এ যোগ হবে।"
                  : "ক্যামেরা প্রস্তুত হচ্ছে..."}
              </p>
              {cameraError ? (
                <p className="text-[11px] text-rose-300">{cameraError}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});

const ProductListButton = memo(function ProductListButton({
  product,
  onAdd,
  isRecentlyAdded,
  isCooldown,
}: {
  product: EnrichedProduct;
  onAdd: (product: EnrichedProduct) => void;
  isRecentlyAdded: boolean;
  isCooldown: boolean;
}) {
  const tracksStock = product.trackStock === true;
  const activeVariants = getActiveVariants(product);
  const variantCount = activeVariants.length;
  const hasVariants = variantCount > 0;

  const displayStock = hasVariants
    ? activeVariants.reduce((sum, v) => sum + toNumber(v.stockQty), 0)
    : toNumber(product.stockQty);

  const stockStyle = tracksStock
    ? getStockToneClasses(displayStock).badge
    : "bg-muted text-muted-foreground border border-border/60";

  return (
    <button
      type="button"
      className={`relative w-full rounded-xl border border-border bg-card/90 px-3 py-2.5 text-left shadow-sm transition hover:border-primary/35 hover:bg-primary-soft/20 ${
        isRecentlyAdded ? "ring-2 ring-success/30" : ""
      } ${isCooldown ? "border-success/35 bg-success-soft/20" : ""}`}
      onClick={() => onAdd(product)}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{product.name}</p>
          <p className="mt-0.5 text-[11px] font-medium tracking-[0.08em] text-muted-foreground">
            {formatCategoryLabel(product.category)}
          </p>
          {product.storageLocation ? (
            <p className="mt-0.5 text-[11px] font-medium text-primary">
              📍 {product.storageLocation}
            </p>
          ) : null}
          {hasVariants ? (
            <p className="mt-0.5 text-[11px] font-semibold text-primary">
              {variantCount}টি সাইজ →
            </p>
          ) : null}
        </div>
        <span
          className={`inline-flex h-6 items-center justify-center rounded-full px-2 text-[11px] font-semibold shadow-sm ${stockStyle}`}
        >
          {tracksStock ? displayStock.toFixed(0) : "N/A"}
        </span>
        <p className="shrink-0 text-sm font-bold text-foreground">
          <span className="text-muted-foreground">৳</span> {product.sellPrice}
        </p>
      </div>
      {isRecentlyAdded ? (
        <span className="absolute -top-1 -right-1 rounded-full bg-success px-2 py-0.5 text-[10px] font-semibold text-primary-foreground pop-badge">
          +1
        </span>
      ) : null}
    </button>
  );
});
