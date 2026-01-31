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
import { useCart } from "@/hooks/use-cart";
import { getStockToneClasses } from "@/lib/stock-level";
import ConfirmDialog from "@/components/confirm-dialog";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";

type PosProductSearchProps = {
  shopId: string;
  products: {
    id: string;
    name: string;
    sellPrice: string;
    stockQty?: string | number;
    category?: string | null;
    trackStock?: boolean | null;
  }[];
};

type UsageEntry = { count: number; lastUsed: number; favorite?: boolean };
type EnrichedProduct = PosProductSearchProps["products"][number] & {
  category: string;
};
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

const QUICK_LIMIT = 8; // fixed slots so buttons never jump during a session
const INITIAL_RENDER = 60;
const RENDER_BATCH = 40;

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

function formatCategoryLabel(raw: string) {
  if (!raw) return "বিভাগহীন";
  if (raw.toLowerCase() === "uncategorized") return "বিভাগহীন";
  return raw.replace("&", "and");
}

function buildQuickSlots(
  products: EnrichedProduct[],
  usageSeed: Record<string, UsageEntry>
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

    return a.name.localeCompare(b.name);
  });

  const slots: QuickSlot[] = Array(QUICK_LIMIT).fill(null);
  const limit = Math.min(QUICK_LIMIT, sorted.length);
  for (let i = 0; i < limit; i += 1) {
    slots[i] = sorted[i];
  }
  return slots;
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
  const stock = toNumber(product.stockQty);
  const stockStyle = getStockToneClasses(stock).badge;

  return (
    <button
      key={product.id}
      type="button"
      className={`relative w-full h-full min-h-[150px] text-left rounded-2xl border border-border bg-gradient-to-br from-card via-card to-muted/40 shadow-[0_8px_20px_rgba(15,23,42,0.08)] hover:border-primary/40 hover:shadow-[0_12px_26px_rgba(15,23,42,0.12)] transition-all p-3.5 pressable active:scale-[0.98] active:translate-y-[1px] ${
        isRecentlyAdded ? "ring-2 ring-success/30" : ""
      } ${stock <= 0 ? "opacity-80" : ""} ${
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
          {stock.toFixed(0)}
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
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mt-2">
        {formatCategoryLabel(product.category)}
      </p>
    </button>
  );
});

export const PosProductSearch = memo(function PosProductSearch({
  products,
  shopId,
}: PosProductSearchProps) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [usage, setUsage] = useState<Record<string, UsageEntry>>({});
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [recentlyAdded, setRecentlyAdded] = useState<string | null>(null);
  const [cooldownProductId, setCooldownProductId] = useState<string | null>(
    null
  );
  const [stockConfirm, setStockConfirm] = useState<{
    product: EnrichedProduct;
    message: string;
  } | null>(null);

  const add = useCart((s: any) => s.add);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const quickSlotsRef = useRef<QuickSlot[] | null>(null);
  const lastAddRef = useRef(0);
  const recentlyAddedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const cooldownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storageKey = useMemo(() => `pos-usage-${shopId}`, [shopId]);
  const [renderCount, setRenderCount] = useState(INITIAL_RENDER);

  const deferredQuery = useDeferredValue(query);
  const debouncedQuery = useDebounce(deferredQuery, 200);

  useEffect(() => {
    const stored =
      typeof window !== "undefined" ? safeLocalStorageGet(storageKey) : null;
    let parsed: Record<string, UsageEntry> = {};
    if (stored) {
      try {
        parsed = JSON.parse(stored);
      } catch {
        parsed = {};
      }
    }
    setUsage(parsed);

    const normalizedProducts: EnrichedProduct[] = products.map((p) => ({
      ...p,
      category: normalizeCategory(p.category),
    }));
    const productById = new Map(normalizedProducts.map((p) => [p.id, p]));

    // Initialize session-locked quick slots once, then keep stock/price fresh.
    if (!quickSlotsRef.current) {
      quickSlotsRef.current = buildQuickSlots(normalizedProducts, parsed);
    } else {
      quickSlotsRef.current = quickSlotsRef.current.map((slot) =>
        slot ? productById.get(slot.id) ?? slot : null
      );
    }
  }, [storageKey, products]);

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
    const SpeechRecognitionImpl =
      typeof window !== "undefined"
        ? (window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition
        : null;

    setVoiceReady(Boolean(SpeechRecognitionImpl));

    return () => {
      recognitionRef.current?.stop?.();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (recentlyAddedTimeoutRef.current) {
        clearTimeout(recentlyAddedTimeoutRef.current);
      }
      if (cooldownTimeoutRef.current) {
        clearTimeout(cooldownTimeoutRef.current);
      }
    };
  }, []);

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
    const term = debouncedQuery.trim().toLowerCase();
    if (!term) return filteredByCategory;

    return filteredByCategory.filter((p) =>
      p.name.toLowerCase().includes(term)
    );
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
    const quickSlots = (quickSlotsRef.current ??
      Array(QUICK_LIMIT).fill(null)) as QuickSlot[];
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
  }, [debouncedQuery, filteredByCategory, sortedResults, usage]);

  useEffect(() => {
    if (!showAllProducts) return;
    setRenderCount(Math.min(INITIAL_RENDER, sortedResults.length));
  }, [showAllProducts, sortedResults.length]);

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

  const addToCart = useCallback(
    (product: EnrichedProduct) => {
      // Prevent double clicks within 300ms (ref-based, not state-based)
      const now = Date.now();
      if (now - lastAddRef.current < 300) return;
      lastAddRef.current = now;

      const productPrice = Number(product.sellPrice || 0);

      add({
        shopId,
        productId: product.id,
        name: product.name,
        unitPrice: productPrice,
      });

      // UI feedback
      setCooldownProductId(product.id);
      bumpUsage(product.id);
      setRecentlyAdded(product.id);
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
    [add, bumpUsage, setCooldownProductId, setRecentlyAdded, shopId]
  );

  const handleAddToCart = useCallback(
    (product: EnrichedProduct) => {
      const stock = toNumber(product.stockQty);
      const cartItems = useCart.getState().items;
      const inCart =
        cartItems.find((i: any) => i.productId === product.id)?.qty || 0;
      const tracksStock = product.trackStock === true;

      if (tracksStock && stock <= inCart) {
        const message =
          stock <= 0
            ? `${product.name} এর স্টক নেই। তবুও যোগ করবেন?`
            : `${product.name} এর মাত্র ${stock}টি আছে। তবুও যোগ করবেন?`;
        setStockConfirm({ product, message });
        return;
      }

      addToCart(product);
    },
    [addToCart]
  );

  const startVoice = () => {
    if (listening) return;
    const SpeechRecognitionImpl =
      typeof window !== "undefined"
        ? (window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition
        : null;

    if (!SpeechRecognitionImpl) {
      setVoiceReady(false);
      setVoiceError("ব্রাউজার মাইক্রোফোন সমর্থন দিচ্ছে না");
      return;
    }

    const recognition: SpeechRecognitionInstance = new SpeechRecognitionImpl();
    recognition.lang = "bn-BD";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onerror = (e: any) => {
      setListening(false);
      const errorCode = e?.error;
      if (errorCode === "not-allowed" || errorCode === "denied") {
        setVoiceError("মাইক্রোফোন অ্যাক্সেস পাওয়া যায়নি");
      } else {
        setVoiceError("ভয়েস সার্চ ব্যর্থ হয়েছে। পরে আবার চেষ্টা করুন।");
      }
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognition.onresult = (event: any) => {
      const spoken: string | undefined = event?.results?.[0]?.[0]?.transcript;
      if (spoken) {
        setQuery((prev) => (prev ? `${prev} ${spoken}` : spoken));
      }
      setListening(false);
    };

    recognitionRef.current = recognition;
    setVoiceError(null);
    setListening(true);
    recognition.start();
  };

  const stopVoice = () => {
    recognitionRef.current?.stop?.();
    setListening(false);
  };
  const voiceErrorText = voiceError ? `(${voiceError})` : "";
  const voiceHint = listening
    ? "শুনছে... পণ্যের নাম বলুন।"
    : voiceReady
    ? "ভয়েসে পণ্যের নাম বলুন।"
    : "ব্রাউজার মাইক্রোফোন সমর্থন দিচ্ছে না";

  const renderProductButton = (product: EnrichedProduct) => (
    <ProductButton
      key={product.id}
      product={product}
      onAdd={handleAddToCart}
      isRecentlyAdded={recentlyAdded === product.id}
      isCooldown={cooldownProductId === product.id}
    />
  );

  const renderPlaceholderSlot = (index: number) => (
    <div
      key={`slot-${index}`}
      className="w-full h-full min-h-[140px] rounded-2xl border border-dashed border-border bg-muted/30 flex items-center justify-center text-xs text-muted-foreground"
    >
      ফিক্সড স্লট
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Search + state toggles */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-muted/40 p-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)] space-y-3 sticky top-0 z-30 md:static md:top-auto">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <input
              className="w-full h-11 rounded-xl border border-border bg-card/80 pl-10 pr-24 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="পণ্য খুঁজুন (নাম/কোড)..."
              value={query}
              onFocus={() => setShowAllProducts(true)}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-base">
              🔍
            </span>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="সার্চ ক্লিয়ার করুন"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground text-sm hover:bg-muted"
                >
                  ✕
                </button>
              ) : null}
              <button
                type="button"
                onClick={listening ? stopVoice : startVoice}
                disabled={!voiceReady}
                aria-label={listening ? "ভয়েস বন্ধ করুন" : "ভয়েস ইনপুট চালু করুন"}
                className={`inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${
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
        <p className="text-xs text-muted-foreground">
          {voiceHint}{" "}
          {voiceErrorText ? (
            <span className="text-danger">{voiceErrorText}</span>
          ) : null}
        </p>
      </div>

      {/* Quick buttons: visible only when not searching to prioritize results */}
      {query.trim().length === 0 && (
        <div className="space-y-3 bg-gradient-to-br from-card via-card to-muted/40 border border-border rounded-2xl p-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
              ⚡ দ্রুত বিক্রি (সেশন-লকড কুইক বাটন)
            </h3>
            <span className="text-xs text-muted-foreground">
              এই বাটনগুলোর অর্ডার সেশনে আর বদলাবে না
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-3.5 px-1 pb-1">
            {(quickSlotsRef.current ?? Array(QUICK_LIMIT).fill(null)).map(
              (slot, idx) =>
                slot ? renderProductButton(slot) : renderPlaceholderSlot(idx)
            )}
          </div>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-3.5 px-1 pb-1 text-sm">
              {smartSuggestions.map((p) => renderProductButton(p))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3 bg-gradient-to-br from-card via-card to-muted/40 border border-border rounded-2xl p-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            সব পণ্য (অটো সাজানো)
          </h3>
          {!showAllProducts && (
            <button
              type="button"
              className="text-xs font-semibold text-primary border border-primary/30 px-3 py-1 rounded-full hover:border-primary/50"
              onClick={() => setShowAllProducts(true)}
            >
              সব পণ্য দেখুন
            </button>
          )}
        </div>
        {showAllProducts ? (
          <>
            <div className="bg-muted/40 border border-border rounded-2xl p-3 flex flex-wrap gap-2">
              {availableCategories.map((cat) => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => {
                    setActiveCategory(cat.key);
                    setShowAllProducts(true);
                  }}
                  className={`px-3 py-2 rounded-full border text-sm transition-colors ${
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-3.5 px-1 pb-1 max-h-[520px] overflow-y-auto pr-2">
              {visibleResults.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 col-span-full">
                  আপনার ফিল্টারে কোনো পণ্য নেই।
                </p>
              ) : (
                visibleResults.map((p) => renderProductButton(p))
              )}
            </div>
            {renderCount < sortedResults.length ? (
              <p className="text-xs text-muted-foreground text-center">
                আরও {sortedResults.length - renderCount} টি পণ্য লোড হচ্ছে...
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            এই সেকশন অন-ডিমান্ড। উপরের বোতাম বা সার্চে ফোকাস করলেই খুলবে।
          </p>
        )}
      </div>
      <ConfirmDialog
        open={Boolean(stockConfirm)}
        title="স্টক নিশ্চিত করুন"
        description={stockConfirm?.message}
        confirmLabel="যোগ করুন"
        cancelLabel="বাতিল"
        onOpenChange={(open) => {
          if (!open) setStockConfirm(null);
        }}
        onConfirm={() => {
          if (!stockConfirm) return;
          const { product } = stockConfirm;
          setStockConfirm(null);
          addToCart(product);
        }}
      />
    </div>
  );
});
