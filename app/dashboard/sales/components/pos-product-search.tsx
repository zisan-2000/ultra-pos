// app/dashboard/sales/components/PosProductSearch.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

const QUICK_LIMIT = 12;

function normalizeCategory(raw?: string | null) {
  const trimmed = (raw || "").trim();
  return trimmed || "Uncategorized";
}

function toNumber(val: string | number | undefined) {
  return Number(val ?? 0);
}

export function PosProductSearch({ products, shopId }: PosProductSearchProps) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [usage, setUsage] = useState<Record<string, UsageEntry>>({});
  const [listening, setListening] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const add = useCart((s) => s.add);
  const items = useCart((s) => s.items);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const storageKey = useMemo(() => `pos-usage-${shopId}`, [shopId]);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
    if (stored) {
      try {
        setUsage(JSON.parse(stored));
      } catch {
        setUsage({});
      }
    } else {
      setUsage({});
    }
  }, [storageKey]);

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

  const bumpUsage = (productId: string) => {
    setUsage((prev) => {
      const next = {
        ...prev,
        [productId]: {
          count: (prev[productId]?.count ?? 0) + 1,
          lastUsed: Date.now(),
          favorite: prev[productId]?.favorite || false,
        },
      };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

  const toggleFavorite = (productId: string) => {
    setUsage((prev) => {
      const current = prev[productId];
      const nextEntry: UsageEntry = {
        count: current?.count ?? 0,
        lastUsed: current?.lastUsed ?? Date.now(),
        favorite: !current?.favorite,
      };
      const next = { ...prev, [productId]: nextEntry };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

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
    const term = query.trim().toLowerCase();
    if (!term) return filteredByCategory;

    return filteredByCategory.filter((p) => p.name.toLowerCase().includes(term));
  }, [filteredByCategory, query]);

  const sortedResults = useMemo(() => {
    const term = query.trim().toLowerCase();
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
  }, [filteredByQuery, usage, query]);

  const favoriteProducts = useMemo(
    () =>
      filteredByCategory.filter((p) => usage[p.id]?.favorite).sort((a, b) => {
        const ua = usage[a.id] || {};
        const ub = usage[b.id] || {};
        return (ub.lastUsed ?? 0) - (ua.lastUsed ?? 0);
      }),
    [filteredByCategory, usage]
  );

  const quickPickSource = filteredByCategory;
  const quickPicks = useMemo(() => {
    const sorted = quickPickSource.slice().sort((a, b) => {
      const ua = usage[a.id] || {};
      const ub = usage[b.id] || {};

      const favoriteDiff = Number(ub.favorite || false) - Number(ua.favorite || false);
      if (favoriteDiff !== 0) return favoriteDiff;

      const countDiff = (ub.count ?? 0) - (ua.count ?? 0);
      if (countDiff !== 0) return countDiff;

      const recencyDiff = (ub.lastUsed ?? 0) - (ua.lastUsed ?? 0);
      if (recencyDiff !== 0) return recencyDiff;

      return a.name.localeCompare(b.name);
    });

    return sorted.slice(0, QUICK_LIMIT);
  }, [quickPickSource, usage]);

  const smartSuggestions = useMemo(() => {
    if (query.trim()) return sortedResults.slice(0, 6);

    const recent = quickPickSource
      .filter((p) => usage[p.id]?.lastUsed)
      .sort((a, b) => (usage[b.id]?.lastUsed ?? 0) - (usage[a.id]?.lastUsed ?? 0))
      .slice(0, 6);

    if (recent.length > 0) return recent;
    return quickPicks.slice(0, 6);
  }, [query, quickPickSource, quickPicks, sortedResults, usage]);

  const handleAddToCart = (product: EnrichedProduct) => {
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
      unitPrice: Number(product.sellPrice),
    });
    bumpUsage(product.id);
  };

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
    recognition.onerror = () => {
      setListening(false);
      setVoiceError("Could not access microphone. Please allow mic permission.");
    };
    recognition.onend = () => setListening(false);
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

  const renderProductButton = (product: EnrichedProduct, compact?: boolean) => {
    const stock = toNumber(product.stockQty);
    return (
      <button
        key={product.id}
        type="button"
        className={`w-full text-left rounded-lg border transition-all ${
          compact
            ? "bg-white border-slate-200 hover:border-emerald-300 hover:shadow-sm p-3"
            : "bg-white border-slate-200 hover:border-emerald-300 hover:shadow-md p-4"
        }`}
        onClick={() => handleAddToCart(product)}
      >
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900 text-base truncate">
                {product.name}
              </h3>
              <span
                role="button"
                tabIndex={0}
                className={`text-xs px-2 py-1 rounded-full border cursor-pointer select-none ${
                  usage[product.id]?.favorite
                    ? "bg-amber-100 border-amber-300 text-amber-800"
                    : "border-slate-200 text-slate-500 hover:border-amber-300"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(product.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleFavorite(product.id);
                  }
                }}
                aria-label="Toggle favorite"
              >
                {usage[product.id]?.favorite ? "Fav" : "Pin"}
              </span>
            </div>
            <p className="text-lg font-bold text-emerald-600 mt-1">Tk {product.sellPrice}</p>
            {!compact && (
              <p className="text-sm text-slate-500 mt-1">
                Tap to add - smart list auto-sorts by your last picks
              </p>
            )}
          </div>
          <div className="text-right">
            <span
              className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                stock <= 0
                  ? "bg-red-100 text-red-700"
                  : stock < 3
                  ? "bg-orange-100 text-orange-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              Stock: {stock.toFixed(0)}
            </span>
            <p className="text-xs text-slate-400 mt-2 capitalize">
              {(product.category || "Uncategorized").replace("&", "and")}
            </p>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex gap-3 items-center">
          <input
            className="flex-1 border border-slate-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="Search product (name/code)..."
            value={query}
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
            {listening ? "Stop" : "Voice"}
          </button>
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="px-3 py-3 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm"
            >
              Clear
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500">
          {listening
            ? "Listening... say the item name to fill search."
            : voiceReady
            ? "Tap Voice to dictate instead of typing."
            : "Voice search is not available in this browser."}
          {voiceError ? ` ${voiceError}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {availableCategories.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => setActiveCategory(cat.key)}
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

      {favoriteProducts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
              Favorite items
            </h3>
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
              Pinned for quick tap
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {favoriteProducts.slice(0, QUICK_LIMIT).map((p) => renderProductButton(p, true))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
            Quick buttons (fast sellers)
          </h3>
          <span className="text-xs text-slate-500">
            Auto-ranked by last used and frequency
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {quickPicks.map((p) => renderProductButton(p, true))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
            Smart suggestions
          </h3>
          <span className="text-xs text-slate-500">
            Prefers last-used and best guesses while you type
          </span>
        </div>
        {smartSuggestions.length === 0 ? (
          <p className="text-sm text-slate-500">No suggestions yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {smartSuggestions.map((p) => renderProductButton(p, true))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
          All products (auto-sorted)
        </h3>
        <div className="space-y-3">
          {sortedResults.length === 0 ? (
            <p className="text-center text-slate-500 py-8">
              No products match your filters.
            </p>
          ) : (
            sortedResults.map((p) => renderProductButton(p))
          )}
        </div>
      </div>
    </div>
  );
}
