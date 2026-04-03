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
  products: {
    id: string;
    name: string;
    sku?: string | null;
    barcode?: string | null;
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

const QUICK_LIMIT = 8; // fixed slots so buttons never jump during a session
const INITIAL_RENDER = 60;
const RENDER_BATCH = 40;
const SCANNER_INTERACTION_PAUSE_MS = 2200;

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
  const stock = toNumber(product.stockQty);
  const stockStyle = tracksStock
    ? getStockToneClasses(stock).badge
    : "bg-muted text-muted-foreground border border-border/60";

  return (
    <button
      key={product.id}
      type="button"
      className={`relative w-full h-full min-h-[150px] text-left rounded-2xl border border-border bg-gradient-to-br from-card via-card to-muted/40 shadow-[0_8px_20px_rgba(15,23,42,0.08)] hover:border-primary/40 hover:shadow-[0_12px_26px_rgba(15,23,42,0.12)] transition-all p-3.5 pressable active:scale-[0.98] active:translate-y-[1px] ${
        isRecentlyAdded ? "ring-2 ring-success/30" : ""
      } ${tracksStock && stock <= 0 ? "opacity-80" : ""} ${
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
          {tracksStock ? stock.toFixed(0) : "N/A"}
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
  canUseBarcodeScan,
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
    message: string;
  } | null>(null);

  const add = useCart((s: any) => s.add);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
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
  const [renderCount, setRenderCount] = useState(INITIAL_RENDER);
  const [showCategoryOverflowCue, setShowCategoryOverflowCue] = useState(false);
  const [categoryScrollAtEnd, setCategoryScrollAtEnd] = useState(true);

  const deferredQuery = useDeferredValue(query);
  const debouncedQuery = useDebounce(deferredQuery, 200);
  const inputModeStorageKey = useMemo(
    () => `pos-input-mode:${shopId}`,
    [shopId]
  );
  const [inputMode, setInputMode] = useState<PosInputMode>("search");
  const scannerAssistEnabled = canUseBarcodeScan && inputMode === "scanner";

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
    if (!canUseBarcodeScan && inputMode === "scanner") {
      setInputMode("search");
    }
  }, [canUseBarcodeScan, inputMode]);

  useEffect(() => {
    if (inputMode === "scanner") {
      setQuery("");
      setShowAllProducts(false);
      setRenderCount(INITIAL_RENDER);
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
    const byCode = new Map<string, EnrichedProduct>();
    productsWithCategory.forEach((p) => {
      const normalizedSku = normalizeCodeInput(p.sku || "");
      const normalizedBarcode = normalizeCodeInput(p.barcode || "");
      if (normalizedSku) byCode.set(normalizedSku, p);
      if (normalizedBarcode) byCode.set(normalizedBarcode, p);
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
      sessionUsageSnapshot
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
    const term = debouncedQuery.trim().toLowerCase();
    if (!term) return filteredByCategory;

    return filteredByCategory.filter((p) => {
      const normalizedSku = (p.sku || "").toLowerCase();
      const normalizedBarcode = (p.barcode || "").toLowerCase();
      return (
        p.name.toLowerCase().includes(term) ||
        normalizedSku.includes(term) ||
        normalizedBarcode.includes(term)
      );
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

      const product = productByCode.get(normalizedCode);
      if (!product) {
        setScanFeedback({
          type: "error",
          message: `কোড ${normalizedCode} পাওয়া যায়নি`,
        });
        playScannerFeedbackTone("error");
        return false;
      }

      lastProcessedScanRef.current = { code: normalizedCode, at: Date.now() };
      handleAddToCart(product);
      setScanFeedback({
        type: "success",
        message:
          source === "camera"
            ? `${product.name} ক্যামেরা স্ক্যানে যোগ হয়েছে`
            : `${product.name} কার্টে যোগ হয়েছে`,
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
      const message = "এই ডিভাইসে ক্যামেরা সাপোর্ট নেই।";
      setCameraError(message);
      setScanFeedback({ type: "error", message });
      return;
    }

    const BarcodeDetectorCtor = (window as any).BarcodeDetector;
    if (!BarcodeDetectorCtor) {
      const message =
        "এই ব্রাউজারে live camera barcode scan সাপোর্ট নেই। Chrome/Edge latest ব্যবহার করুন।";
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

  const renderQuickSlot = (slot: QuickSlot, index: number) => {
    if (!slot) return renderPlaceholderSlot(index);
    return (
      <ProductButton
        key={`quick-slot-${index}`}
        product={slot}
        onAdd={handleAddToCart}
        isRecentlyAdded={recentlyAdded === slot.id}
        isCooldown={cooldownProductId === slot.id}
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
            className="w-full h-10 rounded-xl border border-border bg-card/80 pl-10 pr-22 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
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
      <p className="hidden text-xs text-muted-foreground sm:block">
        {voiceHint}{" "}
        {voiceErrorText ? <span className="text-danger">{voiceErrorText}</span> : null}
      </p>
      {voiceErrorText ? (
        <p className="text-[11px] text-danger sm:hidden">{voiceErrorText}</p>
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
                  Input Mode
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
                {inputMode === "scanner" ? "Scan Ready" : "Search Ready"}
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
                🔎 Search
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
                📷 Scanner
              </button>
            </div>

            {inputMode === "search" ? (
              searchModePanel
            ) : (
              <div className="rounded-xl border border-success/20 bg-success-soft/35 p-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Scanner Mode</p>
                    <p className="text-[11px] text-muted-foreground">
                      scan input active, search typing pause করা আছে
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
                  Scan box scanner-ready থাকবে, accidental duplicate খুব দ্রুত এলে ignore হবে।
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
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            ⚡ দ্রুত বিক্রি
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-3.5 px-1 pb-1">
            {quickSlots.map((slot, idx) => renderQuickSlot(slot, idx))}
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
                  Continuous scan
                </label>
                <button
                  type="button"
                  onClick={toggleCameraTorch}
                  disabled={!cameraTorchSupported}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-white/30 bg-white/10 px-3 text-xs font-semibold disabled:opacity-50"
                >
                  {cameraTorchOn ? "Torch off" : "Torch on"}
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
