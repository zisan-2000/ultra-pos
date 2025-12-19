// app/dashboard/products/components/ProductsListClient.tsx

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  const [listening, setListening] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const lastAppliedRef = useRef({
    query: initialQuery.trim(),
    status: initialStatus,
  });
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);

  // keep client store in sync with the server-selected shop (e.g., when navigating via URL)
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
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;
    setVoiceReady(Boolean(SpeechRecognitionImpl));
    return () => {
      recognitionRef.current?.stop?.();
      recognitionRef.current?.abort?.();
    };
  }, []);

  useEffect(() => {
    if (!online) {
      db.products.where("shopId").equals(activeShopId).toArray().then(setProducts);
    } else {
      setProducts(serverProducts);
    }
  }, [online, activeShopId, serverProducts]);

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
  const effectivePage = Math.min(online ? page : offlinePage, effectiveTotalPages);
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

  function applyFilters(
    targetPage: number,
    nextQuery = query,
    nextStatus = status,
    replace = false
  ) {
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
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    lastAppliedRef.current = { query: query.trim(), status };
    applyFilters(1, query, status, true);
  }

  function handleReset() {
    setQuery("");
    setStatus("all");
    lastAppliedRef.current = { query: "", status: "all" };
    applyFilters(1, "", "all", true);
  }

  function handleStatusChange(nextStatus: ProductStatusFilter) {
    setStatus(nextStatus);
    lastAppliedRef.current = { query: query.trim(), status: nextStatus };
    applyFilters(1, query, nextStatus, true);
  }

  function handleNavigate(targetPage: number) {
    if (targetPage < 1 || targetPage > effectiveTotalPages) return;
    applyFilters(targetPage);
  }

  const handleDelete = useCallback(
    async (id: string) => {
      if (deletingId) return;
      const confirmed = confirm("আপনি কি এই পণ্যটি ডিলিট করতে চান?");
      if (!confirmed) return;
      if (!online) {
        alert("অফলাইনে ডিলিট করা যাবে না। অনলাইনে এসে আবার চেষ্টা করুন।");
        return;
      }
      try {
        setDeletingId(id);
        await deleteProduct(id);
        setProducts((prev) => prev.filter((p) => p.id !== id));
        router.refresh();
      } catch (err) {
        console.error("Delete failed", err);
        alert("পণ্য ডিলিট করা যায়নি। পরে চেষ্টা করুন।");
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
  }, [online, debouncedQuery, status]);

  function startListening() {
    setVoiceError(null);
    const SpeechRecognitionImpl =
      typeof window !== "undefined"
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;

    if (!SpeechRecognitionImpl) {
      setVoiceReady(false);
      setVoiceError("এই ব্রাউজারে ভয়েস সার্চ সমর্থিত নয়।");
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
      setVoiceError(`ভয়েস ইনপুট পাওয়া যায়নি, আবার চেষ্টা করুন।${code}`);
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

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">পণ্যের তালিকা</h1>
          <p className="text-base text-gray-600 mt-2">
            সব পণ্য এক জায়গায় দেখুন, দ্রুত খুঁজুন ও ফিল্টার করুন।
          </p>
          <p className="text-sm text-gray-500 mt-1">
            সক্রিয় দোকান:{" "}
            <span className="font-semibold text-gray-900">{activeShopName}</span>
          </p>
        </div>

        <div className="w-full lg:w-auto flex flex-col sm:flex-row sm:items-center gap-3">
          <ShopSwitcherClient
            shops={shops}
            activeShopId={activeShopId}
            query={query}
            status={status}
          />
          <Link
            href={`/dashboard/products/new?shopId=${activeShopId}`}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg font-semibold hover:border-blue-300 hover:bg-blue-100 transition-colors text-center pressable"
          >
            <span aria-hidden="true">+</span>
            <span>নতুন পণ্য</span>
          </Link>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="flex-1">
            <label htmlFor="product-search" className="text-xs font-medium text-slate-600">
              পণ্যের নাম
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="product-search"
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="যেমন: চা, বিস্কুট, কফি"
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={listening ? stopListening : startListening}
                disabled={!voiceReady}
                className={`px-3 py-2 rounded-md border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 ${
                  !voiceReady ? "opacity-60 cursor-not-allowed" : ""
                }`}
              >
                {listening ? "শোনা হচ্ছে..." : "ভয়েস"}
              </button>
            </div>
            {voiceError ? (
              <p className="text-xs text-red-600 mt-1">{voiceError}</p>
            ) : !voiceReady ? (
              <p className="text-xs text-slate-400 mt-1">এই ব্রাউজারে ভয়েস সার্চ নেই</p>
            ) : null}
          </div>

          <div className="min-w-[160px]">
            <label htmlFor="product-status" className="text-xs font-medium text-slate-600">
              স্ট্যাটাস
            </label>
            <select
              id="product-status"
              value={status}
              onChange={(event) =>
                handleStatusChange(event.target.value as ProductStatusFilter)
              }
              className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
            >
              <option value="all">সবগুলো</option>
              <option value="active">সক্রিয়</option>
              <option value="inactive">নিষ্ক্রিয়</option>
            </select>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 rounded-md bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition"
            >
              খুঁজুন
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 rounded-md border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              রিসেট
            </button>
          </div>
        </form>
      </div>

      {visibleProducts.length === 0 ? (
        <p className="text-center text-gray-600 py-8">কোনো পণ্য পাওয়া যায়নি।</p>
      ) : (
        <div className="space-y-4">
          {visibleProducts.map((product) => (
            <div
              key={product.id}
              className="bg-white border border-gray-200 rounded-lg p-6 flex flex-col gap-4 md:flex-row md:justify-between md:items-center hover:shadow-md card-lift"
            >
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{product.name}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  ক্যাটাগরি: {product.category || "অনির্ধারিত"}
                </p>
                <p className="text-base text-gray-600 mt-2">
                  দাম: {product.sellPrice} ৳ | স্টক: {product.stockQty}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  স্ট্যাটাস: {product.isActive ? "সক্রিয়" : "নিষ্ক্রিয়"}
                </p>
              </div>

              <div className="w-full md:w-auto grid grid-cols-2 gap-2 md:flex md:gap-2">
                <Link
                  href={`/dashboard/products/${product.id}`}
                  className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg font-semibold hover:border-blue-300 hover:bg-blue-100 transition-colors text-center pressable"
                >
                  <span>এডিট</span>
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(product.id)}
                  disabled={deletingId === product.id}
                  className={`w-full md:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 border rounded-lg font-semibold pressable transition-colors ${
                    deletingId === product.id
                      ? "bg-red-50 border-red-100 text-red-400 opacity-70 cursor-not-allowed"
                      : "bg-red-50 border-red-200 text-red-800 hover:border-red-300 hover:bg-red-100"
                  }`}
                >
                  <span>{deletingId === product.id ? "মুছছে..." : "ডিলিট"}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showPagination && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            পৃষ্ঠা {effectivePage} / {effectiveTotalPages} (মোট {effectiveTotalCount})
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleNavigate(effectivePage - 1)}
              disabled={effectivePage <= 1}
              className="px-3 py-1 text-sm rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              আগের
            </button>

            {pageNumbers.map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                onClick={() => handleNavigate(pageNumber)}
                className={`px-3 py-1 text-sm rounded-md border border-slate-200 ${
                  pageNumber === effectivePage
                    ? "bg-slate-100 text-slate-700"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {pageNumber}
              </button>
            ))}

            <button
              type="button"
              onClick={() => handleNavigate(effectivePage + 1)}
              disabled={effectivePage >= effectiveTotalPages}
              className="px-3 py-1 text-sm rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              পরের
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
