// app/dashboard/products/components/ProductsListClient.tsx

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { db } from "@/lib/dexie/db";
import { ShopSwitcherClient } from "../shop-switcher-client";
import { useCurrentShop } from "@/hooks/use-current-shop";
import { deleteProduct } from "@/app/actions/products";

type Shop = { id: string; name: string };
type Product = {
  id: string;
  name: string;
  category: string;
  buyPrice?: string | null;
  sellPrice: string;
  stockQty: string;
  isActive: boolean;
  createdAt?: string;
};

type ProductStatusFilter = "all" | "active" | "inactive";

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

type Props = {
  shops: Shop[];
  activeShopId: string;
  serverProducts: Product[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  initialQuery: string;
  initialStatus: ProductStatusFilter;
};

const MAX_PAGE_BUTTONS = 5;
const SEARCH_DEBOUNCE_MS = 350;

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}

function normalizeText(value: string) {
  return value.toLowerCase().trim();
}

function triggerHaptic(type: "light" | "medium" | "heavy" = "light") {
  if (typeof window !== "undefined" && "vibrate" in navigator) {
    const patterns = { light: 10, medium: 20, heavy: 50 };
    navigator.vibrate(patterns[type]);
  }
}

export default function ProductsListClient({
  shops,
  activeShopId,
  serverProducts,
  page,
  pageSize,
  totalCount,
  totalPages,
  initialQuery,
  initialStatus,
}: Props) {
  const router = useRouter();
  const online = useOnlineStatus();
  const { setShop } = useCurrentShop();
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const [products, setProducts] = useState(serverProducts);
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState<ProductStatusFilter>(initialStatus);
  const [offlinePage, setOfflinePage] = useState(page);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [listening, setListening] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [searchExpanded, setSearchExpanded] = useState(false);

  const lastAppliedRef = useRef({
    query: initialQuery.trim(),
    status: initialStatus,
  });
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    setShop(activeShopId);
  }, [activeShopId, setShop]);

  useEffect(() => {
    setQuery(initialQuery);
    setStatus(initialStatus);
    lastAppliedRef.current = {
      query: initialQuery.trim(),
      status: initialStatus,
    };
  }, [initialQuery, initialStatus]);

  useEffect(() => {
    if (online) {
      setOfflinePage(page);
    }
  }, [online, page]);

  useEffect(() => {
    const SpeechRecognitionImpl =
      typeof window !== "undefined"
        ? (window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition
        : null;
    setVoiceReady(Boolean(SpeechRecognitionImpl));
    return () => {
      recognitionRef.current?.stop?.();
      recognitionRef.current?.abort?.();
    };
  }, []);

  useEffect(() => {
    if (online) {
      setProducts(serverProducts);
      const rows = serverProducts.map((p) => ({
        id: p.id,
        shopId: activeShopId,
        name: p.name,
        category: p.category || "Uncategorized",
        buyPrice: p.buyPrice ?? null,
        sellPrice: p.sellPrice.toString(),
        stockQty: (p.stockQty ?? "0").toString(),
        isActive: p.isActive,
        trackStock: (p as any).trackStock ?? false,
        updatedAt: Date.now(),
        syncStatus: "synced" as const,
      }));
      db.products.bulkPut(rows).catch((err) => {
        console.error("Seed Dexie products failed", err);
      });
      try {
        localStorage.setItem(
          `cachedProducts:${activeShopId}`,
          JSON.stringify(serverProducts)
        );
      } catch (err) {
        console.warn("Persist cached products failed", err);
      }
      return;
    }

    db.products
      .where("shopId")
      .equals(activeShopId)
      .toArray()
      .then((rows) =>
        setProducts(
          rows.map((p) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            buyPrice: p.buyPrice ?? null,
            sellPrice: p.sellPrice,
            stockQty: p.stockQty,
            isActive: p.isActive,
            createdAt: p.updatedAt?.toString?.() || "",
          }))
        )
      )
      .catch((err) => {
        console.error("Load offline products failed", err);
      });
  }, [online, activeShopId, serverProducts]);

  useEffect(() => {
    if (online) return;
    if (products.length > 0) return;

    try {
      const cached = localStorage.getItem(`cachedProducts:${activeShopId}`);
      if (!cached) return;
      const parsed = JSON.parse(cached) as Product[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setProducts(parsed);
      }
    } catch (err) {
      console.warn("Load cached products failed", err);
    }
  }, [online, activeShopId, products.length]);

  const activeShopName = useMemo(
    () => shops.find((s) => s.id === activeShopId)?.name || "",
    [shops, activeShopId]
  );

  const filteredProducts = useMemo(() => {
    if (online) return products;
    const normalizedQuery = normalizeText(query);
    return products.filter((product) => {
      if (status === "active" && !product.isActive) return false;
      if (status === "inactive" && product.isActive) return false;
      if (normalizedQuery) {
        const haystack = `${product.name} ${product.category}`;
        if (!normalizeText(haystack).includes(normalizedQuery)) return false;
      }
      return true;
    });
  }, [online, products, query, status]);

  const effectiveTotalCount = online ? totalCount : filteredProducts.length;
  const effectiveTotalPages = online
    ? totalPages
    : Math.max(1, Math.ceil(effectiveTotalCount / pageSize));
  const effectivePage = Math.min(
    online ? page : offlinePage,
    effectiveTotalPages
  );
  const startIndex = (effectivePage - 1) * pageSize;
  const visibleProducts = online
    ? products
    : filteredProducts.slice(startIndex, startIndex + pageSize);

  const halfWindow = Math.floor(MAX_PAGE_BUTTONS / 2);
  let startPage = Math.max(1, effectivePage - halfWindow);
  let endPage = Math.min(effectiveTotalPages, startPage + MAX_PAGE_BUTTONS - 1);
  startPage = Math.max(1, endPage - MAX_PAGE_BUTTONS + 1);
  const pageNumbers = Array.from(
    { length: endPage - startPage + 1 },
    (_, index) => startPage + index
  );

  const showPagination = effectiveTotalPages > 1;

  const buildHref = useCallback(
    (targetPage: number, nextQuery = query, nextStatus = status) => {
      const params = new URLSearchParams();
      params.set("shopId", activeShopId);
      const cleanQuery = nextQuery.trim();
      if (cleanQuery) params.set("q", cleanQuery);
      if (nextStatus !== "all") params.set("status", nextStatus);
      if (targetPage > 1) params.set("page", `${targetPage}`);
      return `/dashboard/products?${params.toString()}`;
    },
    [activeShopId, query, status]
  );

  const applyFilters = useCallback(
    (
      targetPage: number,
      nextQuery = query,
      nextStatus = status,
      replace = false
    ) => {
      if (online) {
        const href = buildHref(targetPage, nextQuery, nextStatus);
        if (replace) {
          router.replace(href);
        } else {
          router.push(href);
        }
      } else {
        setOfflinePage(targetPage);
      }
    },
    [online, buildHref, router, query, status]
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    triggerHaptic("light");
    lastAppliedRef.current = { query: query.trim(), status };
    applyFilters(1, query, status, true);
  }

  function handleReset() {
    triggerHaptic("medium");
    setQuery("");
    setStatus("all");
    lastAppliedRef.current = { query: "", status: "all" };
    applyFilters(1, "", "all", true);
  }

  function handleStatusChange(nextStatus: ProductStatusFilter) {
    triggerHaptic("light");
    setStatus(nextStatus);
    lastAppliedRef.current = { query: query.trim(), status: nextStatus };
    applyFilters(1, query, nextStatus, true);
  }

  function handleNavigate(targetPage: number) {
    if (targetPage < 1 || targetPage > effectiveTotalPages) return;
    triggerHaptic("light");
    applyFilters(targetPage);
  }

  const handleDelete = useCallback(
    async (id: string) => {
      if (deletingId) return;
      triggerHaptic("medium");
      const confirmed = confirm("আপনি কি এই পণ্যটি ডিলিট করতে চান?");
      if (!confirmed) return;
      if (!online) {
        alert("অফলাইনে ডিলিট করা যাবে না। অনলাইনে এসে আবার চেষ্টা করুন।");
        return;
      }
      try {
        setDeletingId(id);
        triggerHaptic("heavy");
        const result = await deleteProduct(id);

        if (result?.archived) {
          setProducts((prev) =>
            prev.map((p) => (p.id === id ? { ...p, isActive: false } : p))
          );
          alert(
            "এই পণ্যটি আগে বিক্রিতে ব্যবহার হয়েছে, তাই ডিলিট করা যায়নি। এটিকে নিষ্ক্রিয় করা হয়েছে।"
          );
        } else {
          setProducts((prev) => prev.filter((p) => p.id !== id));
        }

        setSelectedProduct(null);
        router.refresh();
      } catch (err) {
        console.error("Delete failed", err);
        const message =
          err instanceof Error && err.message
            ? err.message
            : "পণ্য ডিলিট করা যায়নি। পরে চেষ্টা করুন।";
        alert(message);
      } finally {
        setDeletingId(null);
      }
    },
    [deletingId, online, router]
  );

  useEffect(() => {
    if (online) return;
    setOfflinePage(1);
  }, [online, query, status]);

  useEffect(() => {
    if (!online) return;
    const cleanQuery = debouncedQuery.trim();
    if (
      lastAppliedRef.current.query === cleanQuery &&
      lastAppliedRef.current.status === status
    ) {
      return;
    }
    lastAppliedRef.current = { query: cleanQuery, status };
    applyFilters(1, cleanQuery, status, true);
  }, [online, debouncedQuery, status, applyFilters]);

  function startListening() {
    setVoiceError(null);
    triggerHaptic("light");
    const SpeechRecognitionImpl =
      typeof window !== "undefined"
        ? (window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition
        : null;

    if (!SpeechRecognitionImpl) {
      setVoiceReady(false);
      setVoiceError("এই ব্রাউজারে ভয়েস সার্চ সমর্থিত নয়।");
      return;
    }

    recognitionRef.current?.abort?.();
    recognitionRef.current?.stop?.();

    const recognition: SpeechRecognitionInstance = new SpeechRecognitionImpl();
    recognition.lang = "bn-BD";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onerror = (event: any) => {
      const code = event?.error ? ` (${event.error})` : "";
      setVoiceError(`ভয়েস ইনপুট পাওয়া যায়নি, আবার চেষ্টা করুন।${code}`);
      recognitionRef.current = null;
      setListening(false);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognition.onresult = (event: any) => {
      const transcript = event?.results?.[0]?.[0]?.transcript?.trim?.() || "";
      if (!transcript) return;
      setQuery(transcript);
      triggerHaptic("medium");
      recognition.stop();
    };

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop?.();
    recognitionRef.current?.abort?.();
    setListening(false);
  }

  async function handleRefresh() {
    if (!online) return;
    setIsRefreshing(true);
    triggerHaptic("medium");
    try {
      router.refresh();
      await new Promise((resolve) => setTimeout(resolve, 800));
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Offline Banner - Removed sticky */}
      {!online && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-2">
            <span className="text-lg">📡</span>
            <span className="text-sm font-medium text-amber-800">
              অফলাইন মোড - ডাটা লোকাল থেকে দেখানো হচ্ছে
            </span>
          </div>
        </div>
      )}

      {/* Header Section - Now scrolls normally */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              {/* <span className="text-2xl">📦</span> */}
              <div>
                {/* <h1 className="text-xl font-bold text-gray-900">
                  পণ্যের তালিকা
                </h1> */}
                <p className="text-xs text-gray-500 mt-0.5">{activeShopName}</p>
              </div>
            </div>
            {/* New Product Button - STICKY */}
            <div className="relative z-50">
              <Link
                href={`/dashboard/products/new?shopId=${activeShopId}`}
                onClick={() => triggerHaptic("medium")}
                className="
      sticky top-4
      inline-flex items-center gap-2
      px-4 h-11
      bg-blue-600 text-white
      rounded-full shadow-lg
      hover:bg-blue-700
      active:scale-95
      transition-all
    "
              >
                <span className="text-2xl leading-none">＋</span>
                <span className="text-sm font-semibold whitespace-nowrap">
                  নতুন পণ্য
                </span>
              </Link>
            </div>
          </div>

          {/* Shop Switcher - Scrolls normally */}
          <div className="mb-3">
            <ShopSwitcherClient
              shops={shops}
              activeShopId={activeShopId}
              query={query}
              status={status}
            />
          </div>

          {/* Search Box Container - STICKY */}
          <div className="sticky top-0 z-40 bg-white pt-2 pb-3 -mx-4 px-4">
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setSearchExpanded(true)}
                onBlur={() => {
                  if (!query) setSearchExpanded(false);
                }}
                placeholder="পণ্য খুঁজুন..."
                className="w-full h-12 pl-11 pr-24 text-base border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-0 transition-colors"
              />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
                🔍
              </span>
              {voiceReady && (
                <button
                  type="button"
                  onClick={listening ? stopListening : startListening}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    listening
                      ? "bg-red-500 text-white animate-pulse"
                      : "bg-gray-100 text-gray-700 active:scale-95"
                  }`}
                >
                  {listening ? "🔴" : "🎤"}
                </button>
              )}
            </div>
            {voiceError && (
              <p className="text-xs text-red-600 mt-1 px-1">{voiceError}</p>
            )}
          </div>

          {/* Filter Chips - Scrolls normally */}
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
            {(["all", "active", "inactive"] as const).map((filterStatus) => (
              <button
                key={filterStatus}
                type="button"
                onClick={() => handleStatusChange(filterStatus)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all active:scale-95 ${
                  status === filterStatus
                    ? "bg-blue-600 text-white shadow-md"
                    : "bg-white text-gray-700 border-2 border-gray-200"
                }`}
              >
                {filterStatus === "all" && "সবগুলো"}
                {filterStatus === "active" && "✅ সক্রিয়"}
                {filterStatus === "inactive" && "⏸️ নিষ্ক্রিয়"}
              </button>
            ))}
            {(query || status !== "all") && (
              <button
                type="button"
                onClick={handleReset}
                className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium bg-red-50 text-red-600 border-2 border-red-200 active:scale-95 transition-all"
              >
                ✕ রিসেট
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats Bar - Scrolls normally */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">
            মোট{" "}
            <span className="font-semibold text-gray-900">
              {effectiveTotalCount}
            </span>{" "}
            টি পণ্য
          </span>
          {online && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="text-blue-600 font-medium flex items-center gap-1 active:scale-95 transition-transform disabled:opacity-50"
            >
              <span className={isRefreshing ? "animate-spin" : ""}>🔄</span>
              <span>রিফ্রেশ</span>
            </button>
          )}
        </div>
      </div>

      {/* Products List - Scrolls normally */}
      <div className="px-4 py-4 space-y-3">
        {visibleProducts.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📦</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              কোনো পণ্য পাওয়া যায়নি
            </h3>
            <p className="text-sm text-gray-500">
              {query || status !== "all"
                ? "ফিল্টার পরিবর্তন করে আবার চেষ্টা করুন"
                : "নতুন পণ্য যোগ করতে + বাটনে ক্লিক করুন"}
            </p>
          </div>
        ) : (
          visibleProducts.map((product) => (
            <div
              key={product.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden active:scale-[0.98] transition-transform"
              onClick={() => {
                setSelectedProduct(product);
                triggerHaptic("light");
              }}
            >
              <div className="p-4">
                {/* Product Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0 pr-3">
                    <h3 className="text-base font-semibold text-gray-900 mb-1 line-clamp-2">
                      {product.name}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {product.category || "অনির্ধারিত"}
                    </p>
                  </div>
                  <span
                    className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                      product.isActive
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-gray-100 text-gray-600 border border-gray-300"
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        product.isActive ? "bg-green-500" : "bg-gray-400"
                      }`}
                    />
                    {product.isActive ? "সক্রিয়" : "বন্ধ"}
                  </span>
                </div>

                {/* Product Info Grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                    <p className="text-xs text-blue-600 font-medium mb-1">
                      বিক্রয় মূল্য
                    </p>
                    <p className="text-lg font-bold text-blue-900">
                      ৳ {product.sellPrice}
                    </p>
                  </div>
                  <div className="bg-purple-50 rounded-xl p-3 border border-purple-100">
                    <p className="text-xs text-purple-600 font-medium mb-1">
                      স্টক
                    </p>
                    <p className="text-lg font-bold text-purple-900">
                      {product.stockQty}
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href={`/dashboard/products/${product.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerHaptic("medium");
                    }}
                    className="flex items-center justify-center gap-2 h-11 bg-blue-50 border-2 border-blue-200 text-blue-700 rounded-xl font-semibold text-sm hover:bg-blue-100 active:scale-95 transition-all"
                  >
                    <span>✏️</span>
                    <span>এডিট</span>
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(product.id);
                    }}
                    disabled={deletingId === product.id}
                    className={`flex items-center justify-center gap-2 h-11 border-2 rounded-xl font-semibold text-sm transition-all ${
                      deletingId === product.id
                        ? "bg-red-50 border-red-200 text-red-400 cursor-not-allowed"
                        : "bg-red-50 border-red-200 text-red-700 hover:bg-red-100 active:scale-95"
                    }`}
                  >
                    <span>{deletingId === product.id ? "⏳" : "🗑️"}</span>
                    <span>
                      {deletingId === product.id ? "মুছছে..." : "ডিলিট"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination - Scrolls normally */}
      {showPagination && (
        <div className="bg-white border-t border-gray-200 px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-600">
              পৃষ্ঠা {effectivePage} / {effectiveTotalPages}
            </span>
            <span className="text-sm text-gray-600">
              মোট {effectiveTotalCount} টি
            </span>
          </div>

          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => handleNavigate(effectivePage - 1)}
              disabled={effectivePage <= 1}
              className="flex items-center justify-center w-10 h-10 rounded-xl border-2 border-gray-200 text-gray-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all"
            >
              ←
            </button>

            <div className="flex gap-1.5 overflow-x-auto max-w-[200px]">
              {pageNumbers.map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => handleNavigate(pageNumber)}
                  className={`flex-shrink-0 w-10 h-10 rounded-xl font-semibold text-sm transition-all active:scale-95 ${
                    pageNumber === effectivePage
                      ? "bg-blue-600 text-white shadow-md"
                      : "border-2 border-gray-200 text-gray-700"
                  }`}
                >
                  {pageNumber}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => handleNavigate(effectivePage + 1)}
              disabled={effectivePage >= effectiveTotalPages}
              className="flex items-center justify-center w-10 h-10 rounded-xl border-2 border-gray-200 text-gray-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all"
            >
              →
            </button>
          </div>
        </div>
      )}

      {/* Bottom Sheet for Product Details */}
      {selectedProduct && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end"
          onClick={() => setSelectedProduct(null)}
        >
          <div
            className="bg-white rounded-t-3xl w-full max-h-[80vh] overflow-y-auto animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">পণ্যের বিস্তারিত</h3>
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:scale-95 transition-transform"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <h4 className="text-2xl font-bold text-gray-900 mb-2">
                  {selectedProduct.name}
                </h4>
                <p className="text-sm text-gray-500">
                  {selectedProduct.category}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                  <p className="text-xs text-blue-600 font-medium mb-1">
                    বিক্রয় মূল্য
                  </p>
                  <p className="text-2xl font-bold text-blue-900">
                    ৳ {selectedProduct.sellPrice}
                  </p>
                </div>
                {selectedProduct.buyPrice && (
                  <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                    <p className="text-xs text-green-600 font-medium mb-1">
                      ক্রয় মূল্য
                    </p>
                    <p className="text-2xl font-bold text-green-900">
                      ৳ {selectedProduct.buyPrice}
                    </p>
                  </div>
                )}
                <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                  <p className="text-xs text-purple-600 font-medium mb-1">
                    স্টক
                  </p>
                  <p className="text-2xl font-bold text-purple-900">
                    {selectedProduct.stockQty}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <p className="text-xs text-gray-600 font-medium mb-1">
                    স্ট্যাটাস
                  </p>
                  <p className="text-lg font-bold text-gray-900">
                    {selectedProduct.isActive ? "✅ সক্রিয়" : "⏸️ বন্ধ"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <Link
                  href={`/dashboard/products/${selectedProduct.id}`}
                  className="flex items-center justify-center gap-2 h-12 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 active:scale-95 transition-all"
                  onClick={() => triggerHaptic("medium")}
                >
                  <span>✏️</span>
                  <span>এডিট করুন</span>
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(selectedProduct.id)}
                  disabled={deletingId === selectedProduct.id}
                  className={`flex items-center justify-center gap-2 h-12 rounded-xl font-semibold transition-all ${
                    deletingId === selectedProduct.id
                      ? "bg-red-200 text-red-400 cursor-not-allowed"
                      : "bg-red-600 text-white hover:bg-red-700 active:scale-95"
                  }`}
                >
                  <span>🗑️</span>
                  <span>
                    {deletingId === selectedProduct.id ? "মুছছে..." : "ডিলিট"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
