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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useSyncStatus } from "@/lib/sync/sync-status";
import { db, type LocalProduct } from "@/lib/dexie/db";
import { queueAdd } from "@/lib/sync/queue";
import { getStockToneClasses } from "@/lib/stock-level";
import { ShopSwitcherClient } from "../shop-switcher-client";
import { useCurrentShop } from "@/hooks/use-current-shop";
import { addBusinessProductTemplatesToShop } from "@/app/actions/business-product-templates";
import { deleteProduct } from "@/app/actions/products";
import { handlePermissionError } from "@/lib/permission-toast";
import { subscribeProductEvent } from "@/lib/products/product-events";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";

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
  updatedAt?: string;
};

type TemplateProduct = {
  id: string;
  name: string;
  category: string | null;
  defaultSellPrice: string | null;
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
  businessLabel: string;
  templateProducts: TemplateProduct[];
  canCreateProducts: boolean;
  canUpdateProducts: boolean;
  canDeleteProducts: boolean;
  serverProducts: Product[];
  page: number;
  totalCount: number;
  prevHref: string | null;
  nextHref: string | null;
  hasMore: boolean;
  initialQuery: string;
  initialStatus: ProductStatusFilter;
};

const MAX_PAGE_BUTTONS = 5;
const OFFLINE_PAGE_SIZE = 12;
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
  businessLabel,
  templateProducts,
  canCreateProducts,
  canUpdateProducts,
  canDeleteProducts,
  serverProducts,
  page,
  totalCount,
  prevHref,
  nextHref,
  hasMore,
  initialQuery,
  initialStatus,
}: Props) {
  const router = useRouter();
  const online = useOnlineStatus();
  const { pendingCount, syncing, lastSyncAt } = useSyncStatus();
  const { setShop } = useCurrentShop();
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const serverSnapshotRef = useRef(serverProducts);
  const refreshInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const REFRESH_MIN_INTERVAL_MS = 2_000;
  const lastEventAtRef = useRef(0);
  const EVENT_DEBOUNCE_MS = 500;

  const [products, setProducts] = useState(serverProducts);
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState<ProductStatusFilter>(initialStatus);
  const [offlinePage, setOfflinePage] = useState(page);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(serverProducts.length === 0);
  const [templateSelections, setTemplateSelections] = useState<Record<string, boolean>>({});
  const [addingTemplates, setAddingTemplates] = useState(false);

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
    setTemplateSelections({});
  }, [activeShopId, templateProducts]);

  useEffect(() => {
    if (serverProducts.length === 0 && templateProducts.length > 0) {
      setTemplateOpen(true);
    }
  }, [serverProducts.length, templateProducts.length]);

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
    if (serverSnapshotRef.current !== serverProducts) {
      serverSnapshotRef.current = serverProducts;
      refreshInFlightRef.current = false;
    }
  }, [serverProducts]);

  useEffect(() => {
    if (!online || !lastSyncAt || syncing || pendingCount > 0) return;
    if (refreshInFlightRef.current) return;
    const now = Date.now();
    if (now - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) return;
    refreshInFlightRef.current = true;
    lastRefreshAtRef.current = now;
    router.refresh();
  }, [online, lastSyncAt, syncing, pendingCount, router]);

  useEffect(() => {
    if (!online) return;
    return subscribeProductEvent((detail) => {
      if (detail.shopId !== activeShopId) return;
      const now = detail.at ?? Date.now();
      if (now - lastEventAtRef.current < EVENT_DEBOUNCE_MS) return;
      if (refreshInFlightRef.current) return;
      if (now - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) return;
      lastEventAtRef.current = now;
      lastRefreshAtRef.current = now;
      refreshInFlightRef.current = true;
      router.refresh();
    });
  }, [activeShopId, online, router]);

  useEffect(() => {
    let cancelled = false;

    const loadFromDexie = async () => {
      try {
        const rows = await db.products
          .where("shopId")
          .equals(activeShopId)
          .toArray();
        if (cancelled) return;
        const visible = rows.filter(
          (p) => p.syncStatus !== "deleted" && p.syncStatus !== "conflict"
        );
        if (visible.length > 0) {
          setProducts(
            visible.map((p) => ({
              id: p.id,
              name: p.name,
              category: p.category,
              buyPrice: p.buyPrice ?? null,
              sellPrice: p.sellPrice,
              stockQty: p.stockQty,
              isActive: p.isActive,
              createdAt: p.updatedAt?.toString?.() || "",
            }))
          );
          return;
        }
      } catch (err) {
        handlePermissionError(err);
        console.error("Load offline products failed", err);
      }

      try {
        const cached = safeLocalStorageGet(`cachedProducts:${activeShopId}`);
        if (!cached || cancelled) return;
        const parsed = JSON.parse(cached) as Product[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setProducts(parsed);
        }
      } catch (err) {
        handlePermissionError(err);
        console.warn("Load cached products failed", err);
      }
    };

    if (online) {
      if (syncing || pendingCount > 0 || refreshInFlightRef.current) {
        loadFromDexie();
        return () => {
          cancelled = true;
        };
      }

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
        updatedAt: (() => {
          const raw = (p as any).updatedAt;
          if (!raw) return Date.now();
          const ts = new Date(raw as any).getTime();
          return Number.isFinite(ts) ? ts : Date.now();
        })(),
        syncStatus: "synced" as const,
      }));
      db.transaction("rw", db.products, async () => {
        for (const row of rows) {
          const existing = await db.products.get(row.id);
          if (existing && existing.syncStatus !== "synced") {
            continue;
          }
          await db.products.put(row);
        }
      }).catch((err) => {
        console.error("Seed Dexie products failed", err);
      });
      try {
        safeLocalStorageSet(
          `cachedProducts:${activeShopId}`,
          JSON.stringify(serverProducts)
        );
      } catch (err) {
        handlePermissionError(err);
        console.warn("Persist cached products failed", err);
      }
      return () => {
        cancelled = true;
      };
    }

    loadFromDexie();
    return () => {
      cancelled = true;
    };
  }, [online, activeShopId, serverProducts, pendingCount, syncing]);

  useEffect(() => {
    if (online) return;
    if (products.length > 0) return;

    try {
      const cached = safeLocalStorageGet(`cachedProducts:${activeShopId}`);
      if (!cached) return;
      const parsed = JSON.parse(cached) as Product[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setProducts(parsed);
      }
    } catch (err) {
      handlePermissionError(err);
      console.warn("Load cached products failed", err);
    }
  }, [online, activeShopId, products.length]);

  const activeShopName = useMemo(
    () => shops.find((s) => s.id === activeShopId)?.name || "",
    [shops, activeShopId]
  );

  const normalizedExistingNames = useMemo(() => {
    return new Set(products.map((product) => normalizeText(product.name)));
  }, [products]);

  const templateItems = useMemo(() => {
    if (!templateProducts.length) return [];
    const seen = new Set<string>();
    return templateProducts
      .filter((template) => {
        const key = normalizeText(template.name);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((template) => ({
        ...template,
        alreadyExists: normalizedExistingNames.has(
          normalizeText(template.name)
        ),
      }));
  }, [templateProducts, normalizedExistingNames]);

  const selectableTemplateIds = useMemo(
    () => templateItems.filter((t) => !t.alreadyExists).map((t) => t.id),
    [templateItems]
  );

  const selectedTemplateIds = useMemo(
    () => Object.keys(templateSelections).filter((id) => templateSelections[id]),
    [templateSelections]
  );

  const selectedTemplates = useMemo(
    () => templateItems.filter((template) => templateSelections[template.id]),
    [templateItems, templateSelections]
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
    ? hasMore
      ? page + 1
      : page
    : Math.max(1, Math.ceil(effectiveTotalCount / OFFLINE_PAGE_SIZE));
  const effectivePage = Math.min(online ? page : offlinePage, effectiveTotalPages);
  const startIndex = (effectivePage - 1) * OFFLINE_PAGE_SIZE;
  const visibleProducts = online
    ? products
    : filteredProducts.slice(startIndex, startIndex + OFFLINE_PAGE_SIZE);

  const selectedStockClasses = useMemo(
    () => getStockToneClasses(Number(selectedProduct?.stockQty ?? 0)),
    [selectedProduct]
  );

  const pageNumbers = useMemo(() => {
    // Online uses cursor pagination, so random page jumps are not supported.
    if (online) return [effectivePage];
    const halfWindow = Math.floor(MAX_PAGE_BUTTONS / 2);
    let startPage = Math.max(1, effectivePage - halfWindow);
    let endPage = Math.min(effectiveTotalPages, startPage + MAX_PAGE_BUTTONS - 1);
    startPage = Math.max(1, endPage - MAX_PAGE_BUTTONS + 1);
    return Array.from(
      { length: endPage - startPage + 1 },
      (_, index) => startPage + index
    );
  }, [online, effectivePage, effectiveTotalPages]);

  const showPagination = online
    ? Boolean(prevHref) || Boolean(nextHref)
    : effectiveTotalPages > 1;
  const statusLabel =
    status === "all" ? "সব স্ট্যাটাস" : status === "active" ? "সক্রিয়" : "নিষ্ক্রিয়";
  const queryLabel = query.trim();

  const applyFilters = useCallback(
    (nextQuery = query, nextStatus = status, replace = false) => {
      if (online) {
        const params = new URLSearchParams();
        params.set("shopId", activeShopId);
        const cleanQuery = nextQuery.trim();
        if (cleanQuery) params.set("q", cleanQuery);
        if (nextStatus !== "all") params.set("status", nextStatus);
        const href = `/dashboard/products?${params.toString()}`;
        if (replace) {
          router.replace(href);
        } else {
          router.push(href);
        }
      } else {
        setOfflinePage(1);
      }
    },
    [online, activeShopId, query, status, router]
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    triggerHaptic("light");
    lastAppliedRef.current = { query: query.trim(), status };
    applyFilters(query, status, true);
  }

  function handleReset() {
    triggerHaptic("medium");
    setQuery("");
    setStatus("all");
    lastAppliedRef.current = { query: "", status: "all" };
    applyFilters("", "all", true);
  }

  function handleStatusChange(nextStatus: ProductStatusFilter) {
    triggerHaptic("light");
    setStatus(nextStatus);
    lastAppliedRef.current = { query: query.trim(), status: nextStatus };
    applyFilters(query, nextStatus, true);
  }

  function handleNavigate(targetPage: number) {
    if (!online) {
      if (targetPage < 1 || targetPage > effectiveTotalPages) return;
      triggerHaptic("light");
      setOfflinePage(targetPage);
      return;
    }

    if (targetPage === page - 1 && prevHref) {
      triggerHaptic("light");
      router.push(prevHref);
      return;
    }
    if (targetPage === page + 1 && nextHref) {
      triggerHaptic("light");
      router.push(nextHref);
      return;
    }
  }

  function toggleTemplateSelection(id: string, checked: boolean) {
    setTemplateSelections((prev) => ({ ...prev, [id]: checked }));
  }

  function handleToggleAllTemplates(checked: boolean) {
    if (!checked) {
      setTemplateSelections({});
      return;
    }
    const next: Record<string, boolean> = {};
    selectableTemplateIds.forEach((id) => {
      next[id] = true;
    });
    setTemplateSelections(next);
  }

  function clearTemplateSelections() {
    setTemplateSelections({});
  }

  async function handleAddTemplates() {
    if (!canCreateProducts) {
      alert("You do not have permission to add products.");
      return;
    }
    if (addingTemplates) return;

    const selected = selectedTemplates.filter((template) => !template.alreadyExists);
    if (selected.length === 0) {
      alert("Select at least one item to add.");
      return;
    }

    setAddingTemplates(true);
    triggerHaptic("medium");

    try {
      if (online) {
        const result = await addBusinessProductTemplatesToShop({
          shopId: activeShopId,
          templateIds: selected.map((template) => template.id),
        });
        const createdCount = result?.createdCount ?? 0;
        const skippedCount = result?.skippedCount ?? 0;
        const inactiveCount = result?.inactiveCount ?? 0;

        setTemplateSelections({});
        router.refresh();

        const parts = [`${createdCount} products added`];
        if (skippedCount) parts.push(`${skippedCount} skipped`);
        if (inactiveCount)
          parts.push(`${inactiveCount} added as inactive (missing price)`);
        alert(parts.join(". "));
        return;
      }

      const existingNames = new Set(normalizedExistingNames);
      const now = Date.now();
      const localProducts: LocalProduct[] = [];
      let skipped = 0;
      let inactiveCount = 0;

      for (const template of selected) {
        const key = normalizeText(template.name);
        if (!key || existingNames.has(key)) {
          skipped += 1;
          continue;
        }
        existingNames.add(key);
        const defaultPrice = template.defaultSellPrice?.toString();
        const numericPrice = defaultPrice ? Number(defaultPrice) : 0;
        const hasValidPrice =
          Number.isFinite(numericPrice) && numericPrice > 0;
        if (!hasValidPrice) inactiveCount += 1;

        localProducts.push({
          id: crypto.randomUUID(),
          shopId: activeShopId,
          name: template.name,
          category: template.category || "Uncategorized",
          buyPrice: null,
          sellPrice: defaultPrice || "0",
          stockQty: "0",
          isActive: hasValidPrice,
          trackStock: false,
          updatedAt: now,
          syncStatus: "new",
        });
      }

      if (localProducts.length === 0) {
        alert("All selected items already exist in this shop.");
        return;
      }

      await db.transaction("rw", db.products, db.queue, async () => {
        await db.products.bulkPut(localProducts);
        await Promise.all(
          localProducts.map((item) => queueAdd("product", "create", item))
        );
      });

      setProducts((prev) => [
        ...localProducts.map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          buyPrice: item.buyPrice ?? null,
          sellPrice: item.sellPrice,
          stockQty: item.stockQty,
          isActive: item.isActive,
          createdAt: item.updatedAt.toString(),
        })),
        ...prev,
      ]);

      setTemplateSelections({});
      const parts = [`${localProducts.length} products added offline`];
      if (skipped) parts.push(`${skipped} skipped`);
      if (inactiveCount)
        parts.push(`${inactiveCount} added as inactive (missing price)`);
      parts.push("Will sync when online.");
      alert(parts.join(". "));
    } catch (err) {
      handlePermissionError(err);
      console.error("Add templates failed", err);
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Failed to add templates";
      alert(message);
    } finally {
      setAddingTemplates(false);
    }
  }

  const handleDelete = useCallback(
    async (id: string) => {
      if (!canDeleteProducts) {
        alert("You do not have permission to delete products.");
        return;
      }
      if (deletingId) return;
      triggerHaptic("medium");

      const persistCache = (next: Product[]) => {
        try {
          safeLocalStorageSet(
            `cachedProducts:${activeShopId}`,
            JSON.stringify(next)
          );
        } catch {
          // ignore cache errors
        }
      };

      const removeFromState = () => {
        setProducts((prev) => {
          const next = prev.filter((p) => p.id !== id);
          persistCache(next);
          return next;
        });
      };

      const markArchived = () => {
        setProducts((prev) => {
          const next = prev.map((p) =>
            p.id === id ? { ...p, isActive: false } : p
          );
          persistCache(next);
          return next;
        });
      };

      try {
        setDeletingId(id);
        triggerHaptic("heavy");

        if (!online) {
          removeFromState();
          setSelectedProduct(null);
          await db.transaction("rw", db.products, db.queue, async () => {
            const existing = await db.products.get(id);
            if (existing) {
              const now = Date.now();
              await db.products.update(id, {
                syncStatus: "deleted",
                deletedAt: now,
                updatedAt: now,
                conflictAction: undefined,
              });
              await queueAdd("product", "delete", {
                id,
                updatedAt: existing?.updatedAt,
              });
            } else {
              await queueAdd("product", "delete", { id });
            }
          });
          alert("অফলাইন: পণ্যটি মুছে ফেলা হয়েছে, অনলাইনে গেলে সিঙ্ক হবে।");
          return;
        }

        const result = await deleteProduct(id);

        if (result?.archived) {
          markArchived();
          await db.products.update(id, {
            isActive: false,
            trackStock: false,
            syncStatus: "synced",
            updatedAt: Date.now(),
          });
          alert(
            "এই পণ্যে বিক্রির ইতিহাস আছে, তাই ডিলিট না করে আর্কাইভ করা হয়েছে।"
          );
        } else {
          removeFromState();
          await db.products.delete(id);
        }

        setSelectedProduct(null);
        router.refresh();
      } catch (err) {
        handlePermissionError(err);
        console.error("Delete failed", err);
        const message =
          err instanceof Error && err.message
            ? err.message
            : "ডিলিট ব্যর্থ হয়েছে। আবার চেষ্টা করুন।";
        alert(message);
      } finally {
        setDeletingId(null);
      }
    },
    [activeShopId, canDeleteProducts, deletingId, online, router]
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
    applyFilters(cleanQuery, status, true);
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
    <div className="space-y-4">
      {/* Offline Banner - Removed sticky */}
      {!online && (
        <div className="bg-warning-soft border-b border-warning/30 px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-2">
            <span className="text-lg">📡</span>
            <span className="text-sm font-medium text-warning">
              অফলাইন মোড - ডাটা লোকাল থেকে দেখানো হচ্ছে
            </span>
          </div>
        </div>
      )}

      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_16px_36px_rgba(15,23,42,0.08)] animate-fade-in">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-card to-card" />
        <div className="pointer-events-none absolute -top-16 right-0 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative space-y-3 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                পণ্য
              </p>
              <h1 className="text-2xl font-bold text-foreground leading-tight tracking-tight sm:text-3xl">
                পণ্য তালিকা
              </h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
                দোকান:
                <span className="truncate font-semibold text-foreground">
                  {activeShopName}
                </span>
              </p>
            </div>
            <Link
              href={`/dashboard/products/new?shopId=${activeShopId}`}
              onClick={() => triggerHaptic("medium")}
              className="hidden sm:inline-flex h-10 items-center gap-2 rounded-full bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold shadow-sm hover:bg-primary/15 hover:border-primary/40 transition"
            >
              ➕ নতুন পণ্য
            </Link>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:w-auto">
              <ShopSwitcherClient
                shops={shops}
                activeShopId={activeShopId}
                query={query}
                status={status}
              />
            </div>
            <Link
              href={`/dashboard/products/new?shopId=${activeShopId}`}
              onClick={() => triggerHaptic("medium")}
              className="sm:hidden inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold shadow-sm hover:bg-primary/15 hover:border-primary/40 transition"
            >
              ➕ নতুন পণ্য যোগ করুন
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3 text-xs">
            <span className="inline-flex h-7 items-center gap-1 rounded-full bg-card/80 px-3 font-semibold text-foreground border border-border shadow-[0_1px_0_rgba(0,0,0,0.03)]">
              মোট {effectiveTotalCount} টি
            </span>
            <span className="inline-flex h-7 items-center gap-1 rounded-full bg-card/80 px-3 font-semibold text-muted-foreground border border-border">
              {statusLabel}
            </span>
            {queryLabel && (
              <span
                title={queryLabel}
                className="inline-flex h-7 max-w-[180px] items-center gap-1 rounded-full bg-card/80 px-3 font-semibold text-muted-foreground border border-border truncate"
              >
                🔎 {queryLabel}
              </span>
            )}
            {online && (
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="inline-flex h-7 items-center gap-1 rounded-full border border-primary/30 bg-primary-soft px-3 font-semibold text-primary shadow-sm hover:bg-primary/15 hover:border-primary/40 transition disabled:opacity-50"
              >
                <span className={isRefreshing ? "animate-spin" : ""}>🔄</span>
                রিফ্রেশ
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-30">
        <div className="rounded-2xl border border-border bg-background/95 backdrop-blur-sm shadow-sm">
          <div className="space-y-3 p-3">
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
                className="w-full h-12 pl-11 pr-16 text-base border border-border rounded-xl bg-card shadow-sm focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition"
              />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">
                🔍
              </span>
              {voiceReady && (
                <button
                  type="button"
                  onClick={listening ? stopListening : startListening}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${
                    listening
                      ? "bg-primary-soft text-primary border-primary/40 animate-pulse"
                      : "bg-primary-soft text-primary border-primary/30 active:scale-95"
                  }`}
                >
                  {listening ? "🔴" : "🎤"}
                </button>
              )}
            </div>
            {voiceError && (
              <p className="text-xs text-danger px-1">{voiceError}</p>
            )}

            <div className="relative">
              <div className="flex gap-2 overflow-x-auto no-scrollbar pr-10 py-1">
                {(["all", "active", "inactive"] as const).map((filterStatus) => (
                  <button
                    key={filterStatus}
                    type="button"
                    onClick={() => handleStatusChange(filterStatus)}
                    className={`flex-shrink-0 h-9 px-4 rounded-full text-sm font-semibold transition active:scale-95 border ${
                      status === filterStatus
                        ? "bg-primary-soft text-primary border-primary/40 shadow-sm"
                        : "bg-card text-muted-foreground border-border"
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
                    className="flex-shrink-0 h-9 px-4 rounded-full text-sm font-semibold bg-danger-soft text-danger border border-danger/30 active:scale-95 transition"
                  >
                    ✕ রিসেট
                  </button>
                )}
              </div>
              <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
            </div>
          </div>
        </div>
      </div>

      {templateItems.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-3 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground truncate sm:text-base">
                {businessLabel} এর কমন পণ্য
              </h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground leading-tight sm:text-xs sm:leading-relaxed">
                একসাথে অনেক পণ্য যোগ করুন। যেগুলোর দাম নেই সেগুলো নিষ্ক্রিয় থাকবে।
              </p>
              {selectedTemplateIds.length > 0 && (
                <span className="mt-1 inline-flex items-center rounded-full border border-primary/20 bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {selectedTemplateIds.length} টি বাছাই
                </span>
              )}
            </div>
            <button
              type="button"
              aria-expanded={templateOpen}
              aria-controls="product-template-section"
              onClick={() => setTemplateOpen((prev) => !prev)}
              className="inline-flex h-8 items-center gap-2 rounded-full border border-border bg-background px-3 text-xs font-semibold text-foreground shadow-sm transition hover:bg-muted hover:border-primary/30"
            >
              {templateOpen ? "লুকান" : "দেখান"}
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`h-3.5 w-3.5 transition-transform ${
                  templateOpen ? "rotate-180" : ""
                }`}
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>

          {templateOpen && (
            <div id="product-template-section" className="mt-3 space-y-2">
              <div className="rounded-xl border border-border/70 bg-muted/30 p-2.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={
                        selectableTemplateIds.length > 0 &&
                        selectableTemplateIds.every((id) => templateSelections[id])
                      }
                      onChange={(event) =>
                        handleToggleAllTemplates(event.target.checked)
                      }
                      disabled={!canCreateProducts || selectableTemplateIds.length === 0}
                      className="h-4 w-4"
                    />
                    <span>সবগুলো বাছাই</span>
                  </label>
                  <div className="flex items-center gap-2">
                    {selectedTemplateIds.length > 0 && (
                      <button
                        type="button"
                        onClick={clearTemplateSelections}
                        className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                      >
                        মুছুন
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleAddTemplates}
                      disabled={
                        !canCreateProducts ||
                        addingTemplates ||
                        selectedTemplates.length === 0
                      }
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-full border border-primary/30 bg-primary-soft px-4 text-xs font-semibold text-primary shadow-sm hover:bg-primary/15 hover:border-primary/40 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {addingTemplates ? "যোগ হচ্ছে..." : "বাছাইকৃত যোগ করুন"}
                    </button>
                  </div>
                </div>
              </div>

              {!canCreateProducts && (
                <div className="text-xs text-warning">
                  পণ্য যোগ করার অনুমতি নেই।
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {templateItems.map((template) => {
                  const checked = Boolean(templateSelections[template.id]);
                  const disabled = template.alreadyExists || !canCreateProducts;
                  const numericPrice = template.defaultSellPrice
                    ? Number(template.defaultSellPrice)
                    : 0;
                  const hasPrice =
                    Number.isFinite(numericPrice) && numericPrice > 0;
                  return (
                    <label
                      key={template.id}
                      className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 transition ${
                        disabled
                          ? "border-border bg-muted/50 text-muted-foreground"
                          : checked
                          ? "border-primary/40 bg-primary-soft/50"
                          : "border-border bg-card hover:border-primary/40"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) =>
                          toggleTemplateSelection(template.id, event.target.checked)
                        }
                        disabled={disabled}
                        className="h-4 w-4"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground truncate">
                            {template.name}
                          </span>
                          {template.alreadyExists && (
                            <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                              আগে থেকেই আছে
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {template.category || "Uncategorized"}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 text-[11px] font-semibold">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 ${
                            hasPrice
                              ? "border-primary/20 bg-primary-soft text-primary"
                              : "border-warning/30 bg-warning/10 text-warning"
                          }`}
                        >
                          {hasPrice
                            ? `BDT ${template.defaultSellPrice}`
                            : "দাম নেই"}
                        </span>
                        {!hasPrice && (
                          <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">
                            নিষ্ক্রিয়
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}


      {/* Products List - Scrolls normally */}
      <div className="space-y-3">
        {visibleProducts.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📦</div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              কোনো পণ্য পাওয়া যায়নি
            </h3>
            <p className="text-sm text-muted-foreground">
              {query || status !== "all"
                ? "ফিল্টার পরিবর্তন করে আবার চেষ্টা করুন"
                : "নতুন পণ্য যোগ করতে + বাটনে ক্লিক করুন"}
            </p>
          </div>
        ) : (
          visibleProducts.map((product) => {
            const stockClasses = getStockToneClasses(
              Number(product.stockQty ?? 0)
            );
            const cardAccent = product.isActive
              ? "border-l-4 border-l-success/60"
              : "border-l-4 border-l-muted-foreground/30";
            return (
              <div
                key={product.id}
                className={`bg-card rounded-2xl shadow-sm border border-border overflow-hidden transition card-lift hover:shadow-md active:scale-[0.98] ${cardAccent}`}
                onClick={() => {
                  setSelectedProduct(product);
                  triggerHaptic("light");
                }}
              >
                <div className="p-4">
                {/* Product Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0 pr-3">
                    <h3 className="text-base font-semibold text-foreground mb-1 line-clamp-2">
                      {product.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {product.category || "অনির্ধারিত"}
                    </p>
                  </div>
                  <span
                    className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                      product.isActive
                        ? "bg-success-soft text-success border border-success/30"
                        : "bg-muted text-muted-foreground border border-border"
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        product.isActive ? "bg-success" : "bg-muted-foreground"
                      }`}
                    />
                    {product.isActive ? "সক্রিয়" : "বন্ধ"}
                  </span>
                </div>

                {/* Product Info Grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="rounded-xl p-3 border border-primary/20 bg-primary-soft/70 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
                    <p className="text-xs text-primary font-semibold mb-1">
                      বিক্রয় মূল্য
                    </p>
                    <p className="text-lg font-bold text-foreground">
                      ৳ {product.sellPrice}
                    </p>
                  </div>
                  <div
                    className={`rounded-xl p-3 border ${stockClasses.card} shadow-[0_1px_0_rgba(0,0,0,0.02)]`}
                  >
                    <p className={`text-xs font-semibold mb-1 ${stockClasses.label}`}>
                      স্টক
                    </p>
                    <p className="text-lg font-bold text-foreground">
                      {product.stockQty}
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                {canUpdateProducts || canDeleteProducts ? (
                  <div
                    className={`grid gap-2 ${
                      canUpdateProducts && canDeleteProducts
                        ? "grid-cols-2"
                        : "grid-cols-1"
                    }`}
                  >
                    {canUpdateProducts ? (
                      <Link
                        href={`/dashboard/products/${product.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerHaptic("medium");
                        }}
                        className="flex items-center justify-center gap-2 h-10 rounded-xl bg-primary-soft text-primary border border-primary/30 font-semibold text-sm shadow-sm hover:bg-primary/15 hover:border-primary/40 active:scale-95 transition"
                      >
                        <span>✏️</span>
                        <span>এডিট</span>
                      </Link>
                    ) : null}
                    {canDeleteProducts ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDelete({ id: product.id, name: product.name });
                        }}
                        disabled={deletingId === product.id}
                        className={`flex items-center justify-center gap-2 h-10 rounded-xl border font-semibold text-sm shadow-sm transition ${
                          deletingId === product.id
                            ? "bg-danger-soft border-danger/30 text-danger/60 cursor-not-allowed"
                            : "bg-danger-soft border-danger/30 text-danger hover:bg-danger-soft/80 active:scale-95"
                        }`}
                      >
                        <span>{deletingId === product.id ? "⏳" : "🗑️"}</span>
                        <span>
                          {deletingId === product.id ? "মুছছে..." : "ডিলিট"}
                        </span>
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    এডিট/ডিলিট অনুমতি নেই।
                  </p>
                )}
              </div>
            </div>
          );
        }))}
      </div>

      {/* Pagination - Scrolls normally */}
      {showPagination && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">
              পৃষ্ঠা {effectivePage} / {effectiveTotalPages}
            </span>
            <span className="text-sm text-muted-foreground">
              মোট {effectiveTotalCount} টি
            </span>
          </div>

          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => handleNavigate(effectivePage - 1)}
              disabled={effectivePage <= 1}
              className="flex items-center justify-center w-10 h-10 rounded-xl border border-border text-muted-foreground font-medium shadow-sm disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition"
            >
              {"<"}
            </button>

            <div className="flex gap-1.5 overflow-x-auto max-w-[200px]">
              {pageNumbers.map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => handleNavigate(pageNumber)}
                  className={`flex-shrink-0 w-10 h-10 rounded-xl font-semibold text-sm transition active:scale-95 ${
                    pageNumber === effectivePage
                      ? "bg-primary-soft text-primary border border-primary/40 shadow-sm"
                      : "border border-border text-muted-foreground"
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
              className="flex items-center justify-center w-10 h-10 rounded-xl border border-border text-muted-foreground font-medium shadow-sm disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition"
            >
              {">"}
            </button>
          </div>
        </div>
      )}

      {/* Bottom Sheet for Product Details */}
      {selectedProduct && (
        <div
          className="fixed inset-0 bg-foreground/40 z-50 flex items-end"
          onClick={() => setSelectedProduct(null)}
        >
          <div
            className="bg-card rounded-t-3xl w-full max-h-[80vh] overflow-y-auto animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
              <h3 className="font-semibold text-foreground">পণ্যের বিস্তারিত</h3>
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-muted text-muted-foreground active:scale-95 transition-transform"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <h4 className="text-2xl font-bold text-foreground mb-2">
                  {selectedProduct.name}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {selectedProduct.category}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-primary-soft rounded-xl p-4 border border-primary/30">
                  <p className="text-xs text-primary font-medium mb-1">
                    বিক্রয় মূল্য
                  </p>
                  <p className="text-2xl font-bold text-foreground">
                    ৳ {selectedProduct.sellPrice}
                  </p>
                </div>
                {selectedProduct.buyPrice && (
                  <div className="bg-success-soft rounded-xl p-4 border border-success/30">
  <p className="text-xs text-success font-medium mb-1">
    ক্রয় মূল্য
                    </p>
                    <p className="text-2xl font-bold text-foreground">
                      ৳ {selectedProduct.buyPrice}
                    </p>
                  </div>
                )}
                <div className={`rounded-xl p-4 border ${selectedStockClasses.card}`}>
                  <p className={`text-xs font-medium mb-1 ${selectedStockClasses.label}`}>
                    স্টক
  </p>
  <p className="text-2xl font-bold text-foreground">
    {selectedProduct.stockQty}
  </p>
</div>
                <div className="bg-muted rounded-xl p-4 border border-border">
                  <p className="text-xs text-muted-foreground font-medium mb-1">
                    স্ট্যাটাস
                  </p>
                  <p className="text-lg font-bold text-foreground">
                    {selectedProduct.isActive ? "✅ সক্রিয়" : "⏸️ বন্ধ"}
                  </p>
                </div>
              </div>

              {canUpdateProducts || canDeleteProducts ? (
                <div
                  className={`grid gap-3 pt-2 ${
                    canUpdateProducts && canDeleteProducts
                      ? "grid-cols-2"
                      : "grid-cols-1"
                  }`}
                >
                  {canUpdateProducts ? (
                    <Link
                      href={`/dashboard/products/${selectedProduct.id}`}
                      className="flex items-center justify-center gap-2 h-12 bg-primary-soft text-primary border border-primary/30 rounded-xl font-semibold hover:bg-primary/15 hover:border-primary/40 active:scale-95 transition-all"
                      onClick={() => triggerHaptic("medium")}
                    >
                      <span>✏️</span>
                      <span>এডিট করুন</span>
                    </Link>
                  ) : null}
                  {canDeleteProducts ? (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmDelete({
                          id: selectedProduct.id,
                          name: selectedProduct.name,
                        })
                      }
                      disabled={deletingId === selectedProduct.id}
                      className={`flex items-center justify-center gap-2 h-12 rounded-xl font-semibold transition-all ${
                        deletingId === selectedProduct.id
                          ? "bg-danger-soft text-danger/60 cursor-not-allowed"
                          : "bg-danger text-primary-foreground hover:bg-danger/90 active:scale-95"
                      }`}
                    >
                      <span>🗑️</span>
                      <span>
                        {deletingId === selectedProduct.id ? "মুছছে..." : "ডিলিট"}
                      </span>
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className="pt-2 text-xs text-muted-foreground">
                  এডিট/ডিলিট অনুমতি নেই।
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={Boolean(confirmDelete) && canDeleteProducts}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>পণ্য মুছে ফেলবেন?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmDelete?.name || "এই পণ্যটি"} মুছে দিলে আর ফেরত আনা যাবে না।
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end pt-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(null)}
              className="h-10 px-4 rounded-xl border border-border bg-card text-foreground text-sm font-semibold hover:bg-muted"
            >
              বাতিল
            </button>
            <button
              type="button"
              disabled={Boolean(deletingId) || !confirmDelete}
              onClick={() => {
                if (!confirmDelete) return;
                const id = confirmDelete.id;
                setConfirmDelete(null);
                handleDelete(id);
              }}
              className="h-10 px-4 rounded-xl bg-danger text-primary-foreground text-sm font-semibold hover:bg-danger/90 disabled:opacity-60"
            >
              মুছুন
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

