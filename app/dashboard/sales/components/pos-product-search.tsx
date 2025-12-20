// app/dashboard/sales/components/PosProductSearch.tsx
"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "@/hooks/use-cart";

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
type EnrichedProduct = PosProductSearchProps["products"][number] & { category: string };
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

function buildQuickSlots(
  products: EnrichedProduct[],
  usageSeed: Record<string, UsageEntry>
): QuickSlot[] {
  const sorted = products
    .slice()
    .sort((a, b) => {
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
  recentlyAddedId,
  cooldownProductId,
}: {
  product: EnrichedProduct;
  onAdd: (product: EnrichedProduct) => void;
  recentlyAddedId: string | null;
  cooldownProductId: string | null;
}) {
  const stock = toNumber(product.stockQty);
  const stockStyle =
    stock <= 0
      ? "bg-red-100 text-red-700"
      : stock < 3
      ? "bg-orange-100 text-orange-700"
      : "bg-emerald-100 text-emerald-700";

  const inCooldown = cooldownProductId === product.id;

  return (
    <button
      key={product.id}
      type="button"
      className={`w-full h-full min-h-[140px] text-left rounded-xl border bg-white border-slate-200 hover:border-emerald-300 hover:shadow-sm transition-all p-3.5 pressable active:scale-[0.97] active:translate-y-[1px] ${
        recentlyAddedId === product.id ? "ring-2 ring-emerald-200" : ""
      } ${stock <= 0 ? "opacity-80" : ""} ${
        inCooldown ? "opacity-95 shadow-inner border-emerald-200" : ""
      }`}
      onClick={() => onAdd(product)}
    >
      <div className="flex items-start justify-between gap-2 relative">
        <h3 className="flex-1 font-semibold text-slate-900 text-sm sm:text-base leading-snug line-clamp-2">
          {product.name}
        </h3>
        <span
          className={`inline-flex items-center justify-center px-2.5 py-1 min-w-[44px] rounded-full text-[11px] font-semibold ${stockStyle}`}
        >
          {stock.toFixed(0)}
        </span>
        {recentlyAddedId === product.id && (
          <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full pop-badge">
            +1
          </span>
        )}
      </div>
      <p className="text-base sm:text-lg font-bold text-emerald-600 mt-1">৳ {product.sellPrice}</p>
      <p className="text-[11px] text-slate-500 mt-1 capitalize">
        {(product.category || "Uncategorized").replace("&", "and")}
      </p>
    </button>
  );
});

export function PosProductSearch({ products, shopId }: PosProductSearchProps) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [usage, setUsage] = useState<Record<string, UsageEntry>>({});
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [recentlyAdded, setRecentlyAdded] = useState<string | null>(null);
  const [cooldownProductId, setCooldownProductId] = useState<string | null>(null);

  const add = useCart((s) => s.add);
  const items = useCart((s) => s.items);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const quickSlotsRef = useRef<QuickSlot[] | null>(null);
  const lastAddRef = useRef(0);
  const storageKey = useMemo(() => `pos-usage-${shopId}`, [shopId]);

  const debouncedQuery = useDebounce(query, 200);

  useEffect(() => {
    const stored =
      typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
    let parsed: Record<string, UsageEntry> = {};
    if (stored) {
      try {
        parsed = JSON.parse(stored);
      } catch {
        parsed = {};
      }
    }
    setUsage(parsed);

    // Initialize session-locked quick slots once using persisted usage + current products
    if (!quickSlotsRef.current) {
      const normalizedProducts: EnrichedProduct[] = products.map((p) => ({
        ...p,
        category: normalizeCategory(p.category),
      }));
      quickSlotsRef.current = buildQuickSlots(normalizedProducts, parsed);
    }
  }, [storageKey, products]);

  // Persist usage separately to avoid doing localStorage writes in setState updaters
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(usage));
    } catch {
      // ignore quota / serialization errors in production UI
    }
  }, [usage, storageKey]);

  useEffect(() => {
    const SpeechRecognitionImpl =
      typeof window !== "undefined"
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;

    setVoiceReady(Boolean(SpeechRecognitionImpl));

    return () => {
      recognitionRef.current?.stop?.();
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
    () => products.map((p) => ({ ...p, category: normalizeCategory(p.category) })),
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
      { key: "all", label: "All", count: productsWithCategory.length },
      ...sortedCategories.map(([key, count]) => ({
        key,
        label: key,
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

    return filteredByCategory.filter((p) => p.name.toLowerCase().includes(term));
  }, [filteredByCategory, debouncedQuery]);

  const sortedResults = useMemo(() => {
    const term = debouncedQuery.trim().toLowerCase();
    return filteredByQuery.slice().sort((a, b) => {
      const ua = usage[a.id] || {};
      const ub = usage[b.id] || {};

      const favoriteDiff = Number(ub.favorite || false) - Number(ua.favorite || false);
      if (favoriteDiff !== 0) return favoriteDiff;

      const startDiff =
        Number(term && b.name.toLowerCase().startsWith(term)) -
        Number(term && a.name.toLowerCase().startsWith(term));
      if (startDiff !== 0) return startDiff;

      const countDiff = (ub.count ?? 0) - (ua.count ?? 0);
      if (countDiff !== 0) return countDiff;

      const recencyDiff = (ub.lastUsed ?? 0) - (ua.lastUsed ?? 0);
      if (recencyDiff !== 0) return recencyDiff;

      return a.name.localeCompare(b.name);
    });
  }, [filteredByQuery, usage, debouncedQuery]);

  const smartSuggestions = useMemo(() => {
    const quickSlots = (quickSlotsRef.current ?? Array(QUICK_LIMIT).fill(null)) as QuickSlot[];
    if (debouncedQuery.trim()) return sortedResults.slice(0, 6);

    const quickIds = new Set(
      (quickSlots.filter(Boolean) as EnrichedProduct[]).map((p) => p.id)
    );

    const recent = filteredByCategory
      .filter((p) => usage[p.id]?.lastUsed)
      .sort((a, b) => (usage[b.id]?.lastUsed ?? 0) - (usage[a.id]?.lastUsed ?? 0))
      .slice(0, 6);

    if (recent.length > 0) return recent;
    const slotProducts = quickSlots.filter(Boolean) as EnrichedProduct[];
    return slotProducts.filter((p) => !quickIds.has(p.id)).slice(0, 6);
  }, [debouncedQuery, filteredByCategory, sortedResults, usage]);

  const handleAddToCart = useCallback(
    (product: EnrichedProduct) => {
      // Prevent double clicks within 300ms (ref-based, not state-based)
      const now = Date.now();
      if (now - lastAddRef.current < 300) return;
      lastAddRef.current = now;

      const stock = toNumber(product.stockQty);
      const inCart = items.find((i) => i.productId === product.id)?.qty || 0;
      const tracksStock = product.trackStock === true;

      if (tracksStock && stock <= inCart) {
        const proceed = window.confirm(
          stock <= 0
            ? `${product.name} is out of stock. Add anyway?`
            : `${product.name} has only ${stock} left. Add anyway?`
        );
        if (!proceed) return;
      }

      add({
        shopId,
        productId: product.id,
        name: product.name,
        unitPrice: Number(product.sellPrice || 0),
      });
      setCooldownProductId(product.id);
      bumpUsage(product.id);
      setRecentlyAdded(product.id);
      setTimeout(() => setRecentlyAdded(null), 450);
      setTimeout(() => setCooldownProductId(null), 220);
    },
    [add, bumpUsage, items, setCooldownProductId, setRecentlyAdded, shopId]
  );

  const startVoice = () => {
    if (listening) return;
    const SpeechRecognitionImpl =
      typeof window !== "undefined"
        ? ((window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition)
        : null;

    if (!SpeechRecognitionImpl) {
      setVoiceReady(false);
      setVoiceError("Voice search is not supported in this browser.");
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
        setVoiceError("মাইক পারমিশন নেই। ব্রাউজার থেকে মাইক্রোফোন অনুমতি দিন।");
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

  const renderProductButton = (product: EnrichedProduct) => (
    <ProductButton
      key={product.id}
      product={product}
      onAdd={handleAddToCart}
      recentlyAddedId={recentlyAdded}
      cooldownProductId={cooldownProductId}
    />
  );

  const renderPlaceholderSlot = (index: number) => (
    <div
      key={`slot-${index}`}
      className="w-full h-full min-h-[140px] rounded-xl border border-dashed border-slate-200 bg-white/70 flex items-center justify-center text-xs text-slate-400"
    >
      Fixed slot
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Search + state toggles */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm space-y-3 sticky top-0 z-30 md:static md:top-auto">
        <div className="flex gap-2 items-center">
          <input
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="পণ্য খুঁজুন (নাম/কোড)..."
            value={query}
            onFocus={() => setShowAllProducts(true)}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            onClick={listening ? stopVoice : startVoice}
            disabled={!voiceReady}
            className={`px-4 py-3 rounded-lg border font-semibold text-sm transition-colors ${
              listening
                ? "bg-red-50 border-red-300 text-red-700"
                : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:border-emerald-300"
            } ${!voiceReady ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            {listening ? "বন্ধ করুন" : "ভয়েস"}
          </button>
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="px-3 py-3 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm"
            >
              ক্লিয়ার
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500">
          {listening
            ? "শুনছে... পণ্যের নাম বলুন।"
            : voiceReady
            ? "টাইপ না করে ভয়েসে বলুন।"
            : "এই ব্রাউজারে ভয়েস সার্চ নেই।"}
          {voiceError ? ` ${voiceError}` : ""}
        </p>
      </div>

      {/* Quick buttons: visible only when not searching to prioritize results */}
      {query.trim().length === 0 && (
        <div className="space-y-3 bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
              ⚡ দ্রুত বিক্রি (সেশন-লকড কুইক বাটন)
            </h3>
            <span className="text-xs text-slate-500">
              এই বাটনগুলোর অর্ডার সেশনে আর বদলাবে না
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-3.5 px-1 pb-1">
            {(quickSlotsRef.current ?? Array(QUICK_LIMIT).fill(null)).map((slot, idx) =>
              slot ? renderProductButton(slot) : renderPlaceholderSlot(idx)
            )}
          </div>
        </div>
      )}

      {(query.trim().length > 0 || items.length === 0) && (
        <div className="space-y-3 bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
              Smart suggestions
            </h3>
            <span className="text-xs text-slate-500">
              শুধু সার্চ/ফাঁকা কার্টে হিন্ট দেখানো হচ্ছে
            </span>
          </div>
          {smartSuggestions.length === 0 ? (
            <p className="text-sm text-slate-500">কোনো সাজেশন নেই।</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-3.5 px-1 pb-1 text-sm">
              {smartSuggestions.map((p) => renderProductButton(p))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3 bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
            সব পণ্য (অটো সাজানো)
          </h3>
          {!showAllProducts && (
            <button
              type="button"
              className="text-xs font-semibold text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full hover:border-emerald-300"
              onClick={() => setShowAllProducts(true)}
            >
              সব পণ্য দেখুন
            </button>
          )}
        </div>
        {showAllProducts ? (
          <>
            <div className="bg-gray-50/80 border border-slate-200 rounded-xl p-3 flex flex-wrap gap-2">
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
                      ? "bg-emerald-50 border-emerald-400 text-emerald-800"
                      : "bg-white border-slate-200 text-slate-700 hover:border-emerald-200"
                  }`}
                >
                  {cat.label}
                  <span className="ml-2 text-xs text-slate-500">({cat.count})</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-3.5 px-1 pb-1 max-h-[520px] overflow-y-auto pr-1">
              {sortedResults.length === 0 ? (
                <p className="text-center text-slate-500 py-8 col-span-full">
                  আপনার ফিল্টারে কোনো পণ্য নেই।
                </p>
              ) : (
                sortedResults.map((p) => renderProductButton(p))
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">
            এই সেকশন অন-ডিমান্ড। উপরের বোতাম বা সার্চে ফোকাস করলেই খুলবে।
          </p>
        )}
      </div>
    </div>
  );
}
