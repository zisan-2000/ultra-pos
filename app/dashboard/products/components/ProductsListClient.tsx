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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import RefreshIconButton from "@/components/ui/refresh-icon-button";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useSyncStatus } from "@/lib/sync/sync-status";
import { db, type LocalProduct } from "@/lib/dexie/db";
import { queueAdd } from "@/lib/sync/queue";
import { getStockToneClasses } from "@/lib/stock-level";
import { ShopSwitcherClient } from "../shop-switcher-client";
import { useCurrentShop } from "@/hooks/use-current-shop";
import { addBusinessProductTemplatesToShop } from "@/app/actions/business-product-templates";
import {
  addCatalogProductsToShop,
  searchCatalogProductsForShop,
} from "@/app/actions/catalog";
import {
  deleteProduct,
  getProductReturnInsights,
  type ProductCardMetrics,
  type ProductReturnInsight,
} from "@/app/actions/products";
import { createStockAdjustment } from "@/app/actions/stock-adjustments";
import { handlePermissionError } from "@/lib/permission-toast";
import { subscribeProductEvent } from "@/lib/products/product-events";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";
import {
  getSpeechRecognitionCtor,
  mapVoiceErrorBangla,
} from "@/lib/voice-recognition";
import { matchesProductSearchQuery } from "@/lib/product-search";

type Shop = { id: string; name: string };
type ProductVariant = {
  id?: string;
  label: string;
  sellPrice: string | number;
  stockQty?: string | number | null;
  reorderPoint?: number | null;
  storageLocation?: string | null;
  sku?: string | null;
  barcode?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

type Product = {
  id: string;
  name: string;
  category: string;
  sku?: string | null;
  barcode?: string | null;
  baseUnit?: string;
  buyPrice?: string | null;
  sellPrice: string;
  stockQty: string;
  reorderPoint?: number | null;
  storageLocation?: string | null;
  conversionSummary?: string | null;
  trackStock?: boolean | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  variants?: ProductVariant[];
  metrics?: ProductCardMetrics | null;
};

type TemplateProduct = {
  id: string;
  name: string;
  brand?: string | null;
  category: string | null;
  packSize?: string | null;
  defaultBuyPrice?: string | null;
  defaultSellPrice: string | null;
  defaultOpeningStock?: string | null;
  defaultBarcode?: string | null;
  defaultBaseUnit?: string | null;
  defaultTrackStock?: boolean;
  aliases?: string[];
  keywords?: string[];
  popularityScore?: number;
  imageUrl?: string | null;
  variants?: Array<{
    label: string;
    buyPrice?: string | number | null;
    sellPrice: string | number;
    openingStock?: string | number | null;
    sku?: string | null;
    barcode?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  }>;
};

type TemplateSetupVariantDraft = {
  label: string;
  buyPrice: string;
  openingStock: string;
  sellPrice: string;
  isActive: boolean;
};

type TemplateSetupDraft = {
  templateId: string;
  name: string;
  category: string | null;
  baseUnit: string;
  trackStock: boolean;
  hasVariants: boolean;
  buyPrice: string;
  openingStock: string;
  variants: TemplateSetupVariantDraft[];
};

type CatalogProduct = {
  id: string;
  name: string;
  businessType?: string | null;
  brand?: string | null;
  category?: string | null;
  packSize?: string | null;
  defaultBaseUnit?: string | null;
  imageUrl?: string | null;
  popularityScore?: number;
  sourceType?: string;
  externalRef?: string | null;
  aliases?: Array<{
    alias: string;
    locale?: string | null;
    isPrimary?: boolean;
  }>;
  barcodes?: Array<{
    code: string;
    format?: string | null;
    isPrimary?: boolean;
  }>;
  latestPrice?: string | null;
  latestPriceKind?: string | null;
  latestPriceObservedAt?: string | null;
  importSource?: {
    id: string;
    slug: string;
    name: string;
    type: string;
  } | null;
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

type VoiceSearchMode = "bn" | "en";

type Props = {
  shops: Shop[];
  activeShopId: string;
  businessType?: string | null;
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

type HardwareStarterPack = {
  id: string;
  title: string;
  subtitle: string;
  accent: string;
  templateIds: string[];
  sampleNames: string[];
  productCount: number;
  variantCount: number;
};

type CatalogSegmentId =
  | "all"
  | "cement_building"
  | "rod_steel"
  | "pipe_fittings"
  | "electrical"
  | "paint_chemical"
  | "structural";

type OnboardingSection = "starter" | "template" | "catalog";

const MAX_PAGE_BUTTONS = 5;
const OFFLINE_PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 350;
const VOICE_LANG_BY_MODE: Record<VoiceSearchMode, string> = {
  bn: "bn-BD",
  en: "en-US",
};
const UNTRACKED_STOCK_CLASSES = {
  card: "border-border bg-muted/40",
  label: "text-muted-foreground",
};

const HARDWARE_CATALOG_FILTERS: Array<{
  id: CatalogSegmentId;
  label: string;
}> = [
  { id: "all", label: "সব" },
  { id: "cement_building", label: "সিমেন্ট/বিল্ডিং" },
  { id: "rod_steel", label: "রড/স্টিল" },
  { id: "pipe_fittings", label: "পাইপ/ফিটিংস" },
  { id: "electrical", label: "ইলেকট্রিক্যাল" },
  { id: "paint_chemical", label: "রং/কেমিক্যাল" },
  { id: "structural", label: "স্ট্রাকচারাল" },
];

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

function normalizeCodeText(value?: string | null) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

function triggerHaptic(type: "light" | "medium" | "heavy" = "light") {
  if (typeof window !== "undefined" && "vibrate" in navigator) {
    const patterns = { light: 10, medium: 20, heavy: 50 };
    navigator.vibrate(patterns[type]);
  }
}

function toSafeNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatCategoryLabel(raw?: string | null) {
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

  return normalized
    .split(/[\s/_&-]+/)
    .filter(Boolean)
    .map((token) => {
      const lower = token.toLowerCase();
      return (
        dictionary[lower] ??
        token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
      );
    })
    .join(" / ");
}

function getActiveVariants(product?: Product | null) {
  if (!product || !Array.isArray(product.variants)) return [];
  return product.variants
    .filter((variant) => variant && variant.isActive !== false)
    .sort(
      (a, b) =>
        Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) ||
        String(a.label || "").localeCompare(String(b.label || ""))
    );
}

function getDisplayStockQty(product?: Product | null) {
  if (!product || product.trackStock !== true) return 0;
  const activeVariants = getActiveVariants(product);
  if (activeVariants.length > 0) {
    return activeVariants.reduce(
      (sum, variant) => sum + toSafeNumber(variant.stockQty),
      0
    );
  }
  return toSafeNumber(product.stockQty);
}

function formatStockNumber(value: number) {
  return value.toLocaleString("bn-BD", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  });
}

function formatStockText(product?: Product | null) {
  if (!product || product.trackStock !== true) return "ট্র্যাক নয়";
  const qty = getDisplayStockQty(product);
  const unit = product.baseUnit ? ` ${product.baseUnit}` : "";
  return `${formatStockNumber(qty)}${unit}`;
}

function getVariantSummary(product?: Product | null) {
  const activeVariants = getActiveVariants(product);
  if (activeVariants.length === 0) return null;
  if (activeVariants.length <= 3) {
    return activeVariants
      .map((variant) => String(variant.label || "").trim())
      .filter(Boolean)
      .join(" · ");
  }
  return `${activeVariants.length.toLocaleString("bn-BD")}টি সাইজ`;
}

function formatCompactMetric(value: unknown) {
  return toSafeNumber(value).toLocaleString("bn-BD", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatQty(value: unknown) {
  return toSafeNumber(value).toLocaleString("bn-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: unknown) {
  return toSafeNumber(value).toLocaleString("bn-BD", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return "তথ্য নেই";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "তথ্য নেই";
  return date.toLocaleString("bn-BD", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTemplatePrice(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return numeric.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function buildTemplateSetupDraft(template: TemplateProduct): TemplateSetupDraft {
  const activeVariants = Array.isArray(template.variants)
    ? template.variants
        .filter((variant) => variant?.isActive !== false)
        .sort(
          (left, right) =>
            (Number(left.sortOrder ?? 0) || 0) - (Number(right.sortOrder ?? 0) || 0)
        )
    : [];

  return {
    templateId: template.id,
    name: template.name,
    category: template.category ?? null,
    baseUnit: template.defaultBaseUnit || "pcs",
    trackStock: template.defaultTrackStock === true,
    hasVariants: activeVariants.length > 0,
    buyPrice: template.defaultBuyPrice?.toString?.() ?? "",
    openingStock: template.defaultOpeningStock?.toString?.() ?? "",
    variants: activeVariants.map((variant) => ({
      label: String(variant.label || "").trim(),
      buyPrice: variant.buyPrice?.toString?.() ?? "",
      openingStock: variant.openingStock?.toString?.() ?? "",
      sellPrice: variant.sellPrice?.toString?.() ?? "",
      isActive: variant.isActive !== false,
    })),
  };
}

function matchesHardwarePack(
  template: TemplateProduct,
  packId: string,
) {
  const category = String(template.category || "").toLowerCase();
  const name = String(template.name || "").toLowerCase();
  const keywords = Array.isArray(template.keywords)
    ? template.keywords.map((item) => String(item || "").toLowerCase())
    : [];
  const haystack = [category, name, ...keywords].join(" ");

  switch (packId) {
    case "cement_building":
      return /সিমেন্ট|building|cement|বালু|খোয়া|khoa|stone|aggregate|brick|ইট|tile|টাইল/.test(
        haystack,
      );
    case "rod_steel":
      return /rod|রড|steel|স্টিল|angle|এঙ্গেল|channel|চ্যানেল|binding wire|ওয়্যার|wire/.test(
        haystack,
      );
    case "pipe_fittings":
      return /পাইপ|pipe|fitting|fittings|elbow|এলবো|tee|ভাল্ব|valve|tank|ট্যাংক/.test(
        haystack,
      );
    case "electrical":
      return /ইলেকট্রিক|electrical|switch|socket|mcb|breaker|wire|তার/.test(
        haystack,
      );
    case "paint_chemical":
      return /রং|paint|chemical|কেমিক্যাল/.test(haystack);
    case "full_hardware":
      return true;
    default:
      return false;
  }
}

function getBaseUnitLabel(raw?: string | null) {
  const normalized = String(raw || "pcs").trim().toLowerCase();
  const dictionary: Record<string, string> = {
    pcs: "পিস",
    pc: "পিস",
    piece: "পিস",
    pieces: "পিস",
    bag: "ব্যাগ",
    kg: "কেজি",
    g: "গ্রাম",
    gm: "গ্রাম",
    liter: "লিটার",
    litre: "লিটার",
    ml: "মিলি",
    ft: "ফুট",
    feet: "ফুট",
    inch: "ইঞ্চি",
    box: "বক্স",
    bundle: "বান্ডিল",
    coil: "কয়েল",
    roll: "রোল",
    packet: "প্যাকেট",
    pack: "প্যাক",
  };
  return dictionary[normalized] ?? normalized.toUpperCase();
}

function getCatalogSegment(item: CatalogProduct): CatalogSegmentId {
  const haystack = [
    item.name,
    item.category,
    item.brand,
    item.packSize,
    ...(item.aliases?.map((alias) => alias.alias) ?? []),
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  if (
    /cement|সিমেন্ট|building|ইট|brick|block|sand|বালু|stone|aggregate|tile|টাইল/.test(
      haystack,
    )
  ) {
    return "cement_building";
  }
  if (/rod|রড|steel|স্টিল|angle|channel|beam|girder|binding wire|ms /.test(haystack)) {
    return "rod_steel";
  }
  if (/pipe|পাইপ|fitting|elbow|socket|tee|valve|tap|tank|pvc|cpvc|u?pc/.test(haystack)) {
    return "pipe_fittings";
  }
  if (/switch|socket|wire|cable|mcb|breaker|bulb|light|electrical|ইলেকট্রিক/.test(haystack)) {
    return "electrical";
  }
  if (/paint|রং|chemical|thinner|primer|putty|adhesive|epoxy/.test(haystack)) {
    return "paint_chemical";
  }
  if (/sheet|channel|angle|flat bar|pipe|steel|rod|girder|beam/.test(haystack)) {
    return "structural";
  }
  return "all";
}

function getCatalogPrimaryBadge(item: CatalogProduct) {
  const hasPrice =
    Number.isFinite(Number(item.latestPrice ?? 0)) &&
    Number(item.latestPrice ?? 0) > 0;
  if (!hasPrice) {
    return {
      label: "বিক্রয়মূল্য দিন",
      className: "border-warning/30 bg-warning/10 text-warning",
    };
  }
  return {
    label: `দাম ৳ ${formatTemplatePrice(item.latestPrice)}`,
    className: "border-primary/20 bg-primary-soft text-primary",
  };
}

function getCatalogSecondaryBadges(item: CatalogProduct) {
  const badges: Array<{ label: string; className: string }> = [];
  if ((item.barcodes?.length ?? 0) > 0) {
    badges.push({
      label: `${item.barcodes!.length.toLocaleString("bn-BD")}টি বারকোড`,
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    });
  }
  if ((item.aliases?.length ?? 0) > 0) {
    badges.push({
      label: `${item.aliases!.length.toLocaleString("bn-BD")}টি বিকল্প নাম`,
      className: "border-border bg-muted/40 text-muted-foreground",
    });
  }
  return badges;
}

function getUniqueTemplateCategoryCount(items: TemplateProduct[]) {
  return new Set(
    items.map((item) => formatCategoryLabel(item.category || "বিভাগহীন")),
  ).size;
}

function emptyMetrics(): ProductCardMetrics {
  return {
    soldQtyToday: "0.00",
    returnedQtyToday: "0.00",
    exchangeQtyToday: "0.00",
    netQtyToday: "0.00",
    soldQty30d: "0.00",
    returnedQty30d: "0.00",
    returnRate30d: "0.0",
    lastReturnAt: null,
  };
}

function getProductMetrics(product?: Product | null): ProductCardMetrics {
  if (!product?.metrics) return emptyMetrics();
  return {
    ...emptyMetrics(),
    ...product.metrics,
  };
}

export default function ProductsListClient({
  shops,
  activeShopId,
  businessType,
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
  const voiceStopRequestedRef = useRef(false);
  const serverSnapshotRef = useRef(serverProducts);
  const refreshInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const catalogSectionRef = useRef<HTMLDivElement | null>(null);
  const REFRESH_MIN_INTERVAL_MS = 2_000;
  const lastEventAtRef = useRef(0);
  const EVENT_DEBOUNCE_MS = 500;

  const [products, setProducts] = useState(serverProducts);
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState<ProductStatusFilter>(initialStatus);
  const [offlinePage, setOfflinePage] = useState(page);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [expandedKpiByProductId, setExpandedKpiByProductId] = useState<
    Record<string, boolean>
  >({});
  const [productInsights, setProductInsights] = useState<
    Record<string, ProductReturnInsight>
  >({});
  const [insightLoadingProductId, setInsightLoadingProductId] = useState<
    string | null
  >(null);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [starterPackOpen, setStarterPackOpen] = useState(
    serverProducts.length === 0 && businessType === "hardware"
  );
  const [templateOpen, setTemplateOpen] = useState(
    serverProducts.length === 0 && businessType !== "hardware"
  );
  const [templateSelections, setTemplateSelections] = useState<Record<string, boolean>>({});
  const [templateSetupOpen, setTemplateSetupOpen] = useState(false);
  const [templateSetupDrafts, setTemplateSetupDrafts] = useState<TemplateSetupDraft[]>([]);
  const [addingTemplates, setAddingTemplates] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSegment, setCatalogSegment] = useState<CatalogSegmentId>("all");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogItems, setCatalogItems] = useState<CatalogProduct[]>([]);
  const [catalogSelections, setCatalogSelections] = useState<Record<string, boolean>>({});
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [addingCatalog, setAddingCatalog] = useState(false);

  type AdjustTarget = {
    productId: string;
    variantId?: string | null;
    productName: string;
    variantLabel?: string | null;
    currentQty: string;
  };
  const [adjusting, setAdjusting] = useState<AdjustTarget | null>(null);
  const [adjustNewQty, setAdjustNewQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const [listening, setListening] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState<VoiceSearchMode>(() => {
    const stored = safeLocalStorageGet(`products-voice-mode:${activeShopId}`);
    return stored === "en" ? "en" : "bn";
  });
  const [searchExpanded, setSearchExpanded] = useState(false);

  const lastAppliedRef = useRef({
    query: initialQuery.trim(),
    status: initialStatus,
  });
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);
  const debouncedCatalogQuery = useDebounce(catalogQuery, SEARCH_DEBOUNCE_MS);
  const voiceModeStorageKey = useMemo(
    () => `products-voice-mode:${activeShopId}`,
    [activeShopId]
  );

  const setOnboardingSection = useCallback((section: OnboardingSection | null) => {
    setStarterPackOpen(section === "starter");
    setTemplateOpen(section === "template");
    setCatalogOpen(section === "catalog");
  }, []);

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
    setTemplateSetupDrafts([]);
    setTemplateSetupOpen(false);
    setCatalogSelections({});
    setCatalogSegment("all");
    setCatalogQuery("");
    setCatalogError(null);
  }, [activeShopId, templateProducts]);

  useEffect(() => {
    setSelectedProduct(null);
    setExpandedKpiByProductId({});
    setProductInsights({});
    setInsightLoadingProductId(null);
    setInsightError(null);
  }, [activeShopId]);

  useEffect(() => {
    if (serverProducts.length === 0 && templateProducts.length > 0) {
      if (businessType === "hardware") {
        setOnboardingSection("starter");
      } else {
        setOnboardingSection("template");
      }
    } else if (serverProducts.length > 0) {
      setOnboardingSection(null);
    }
  }, [businessType, serverProducts.length, setOnboardingSection, templateProducts.length]);

  useEffect(() => {
    if (!online) {
      setCatalogLoading(false);
      return;
    }
    if (!catalogOpen) return;

    let cancelled = false;
    setCatalogLoading(true);
    setCatalogError(null);

    (async () => {
      try {
        const rows = await searchCatalogProductsForShop({
          shopId: activeShopId,
          query: debouncedCatalogQuery.trim() || undefined,
          limit: businessType === "hardware" ? 48 : 24,
        });
        if (cancelled) return;
        setCatalogItems(Array.isArray(rows) ? rows : []);
      } catch (err) {
        if (cancelled) return;
        handlePermissionError(err);
        setCatalogItems([]);
        setCatalogError(
          err instanceof Error ? err.message : "ক্যাটালগ লোড করা যায়নি",
        );
      } finally {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeShopId, businessType, catalogOpen, debouncedCatalogQuery, online]);

  useEffect(() => {
    if (online) {
      setOfflinePage(page);
    }
  }, [online, page]);

  useEffect(() => {
    const SpeechRecognitionImpl = getSpeechRecognitionCtor();
    setVoiceReady(Boolean(SpeechRecognitionImpl));
    return () => {
      voiceStopRequestedRef.current = true;
      recognitionRef.current?.stop?.();
      recognitionRef.current?.abort?.();
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    const stored = safeLocalStorageGet(voiceModeStorageKey);
    setVoiceMode(stored === "en" ? "en" : "bn");
    setVoiceError(null);
    setListening(false);
    voiceStopRequestedRef.current = true;
    recognitionRef.current?.stop?.();
    recognitionRef.current?.abort?.();
    recognitionRef.current = null;
  }, [voiceModeStorageKey]);

  useEffect(() => {
    safeLocalStorageSet(voiceModeStorageKey, voiceMode);
  }, [voiceMode, voiceModeStorageKey]);

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
    if (!selectedProduct || !online) {
      setInsightLoadingProductId(null);
      return;
    }

    const productId = selectedProduct.id;
    if (productInsights[productId]) {
      setInsightLoadingProductId(null);
      return;
    }

    let cancelled = false;
    setInsightLoadingProductId(productId);
    setInsightError(null);

    (async () => {
      try {
        const insight = await getProductReturnInsights(productId, 12);
        if (cancelled) return;
        setProductInsights((prev) => ({ ...prev, [productId]: insight }));
      } catch (err) {
        if (cancelled) return;
        handlePermissionError(err);
        setInsightError(
          err instanceof Error ? err.message : "ইনসাইট লোড করা যায়নি"
        );
      } finally {
        if (cancelled) return;
        setInsightLoadingProductId((prev) => (prev === productId ? null : prev));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [online, productInsights, selectedProduct]);

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
              sku: (p as any).sku ?? null,
              barcode: (p as any).barcode ?? null,
              buyPrice: p.buyPrice ?? null,
              sellPrice: p.sellPrice,
              stockQty: p.stockQty,
              trackStock: p.trackStock ?? false,
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
        sku: (p as any).sku ?? null,
        barcode: (p as any).barcode ?? null,
        baseUnit: p.baseUnit || "pcs",
        buyPrice: p.buyPrice ?? null,
        sellPrice: p.sellPrice.toString(),
        stockQty: (p.stockQty ?? "0").toString(),
        isActive: p.isActive,
        trackStock: (p as any).trackStock ?? false,
        variants: Array.isArray(p.variants) ? p.variants : [],
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

  const hardwareStarterPacks = useMemo<HardwareStarterPack[]>(() => {
    if (String(businessType || "").trim().toLowerCase() !== "hardware") return [];

    const definitions = [
      {
        id: "cement_building",
        title: "সিমেন্ট ও বিল্ডিং",
        subtitle: "সিমেন্ট, ইট, বালু, টাইলস ধরনের শুরু সেটআপ",
        accent: "from-amber-100 via-orange-50 to-white",
      },
      {
        id: "rod_steel",
        title: "রড ও স্টিল",
        subtitle: "রড, এঙ্গেল, চ্যানেল, বাইন্ডিং ওয়্যার",
        accent: "from-slate-100 via-zinc-50 to-white",
      },
      {
        id: "pipe_fittings",
        title: "পাইপ ও ফিটিংস",
        subtitle: "PVC/MS pipe, elbow, tee, valve, tank",
        accent: "from-sky-100 via-cyan-50 to-white",
      },
      {
        id: "electrical",
        title: "ইলেকট্রিক্যাল",
        subtitle: "switch, socket, breaker, wire",
        accent: "from-yellow-100 via-lime-50 to-white",
      },
      {
        id: "paint_chemical",
        title: "রং ও কেমিক্যাল",
        subtitle: "paint, thinner, finishing ধরনের common items",
        accent: "from-emerald-100 via-teal-50 to-white",
      },
      {
        id: "full_hardware",
        title: "ফুল হার্ডওয়্যার স্টার্টার",
        subtitle: "জনপ্রিয় সব hardware template একসাথে",
        accent: "from-primary/15 via-primary/5 to-white",
      },
    ] as const;

    const packs: HardwareStarterPack[] = [];
    for (const definition of definitions) {
        const packTemplates = templateItems.filter((template) =>
          matchesHardwarePack(template, definition.id)
        );
        if (packTemplates.length === 0) continue;
        packs.push({
          id: definition.id,
          title: definition.title,
          subtitle: definition.subtitle,
          accent: definition.accent,
          templateIds: packTemplates.map((template) => template.id),
          sampleNames: packTemplates.slice(0, 4).map((template) => template.name),
          productCount: packTemplates.length,
          variantCount: packTemplates.reduce(
            (sum, template) =>
              sum +
              (Array.isArray(template.variants)
                ? template.variants.filter((variant) => variant?.isActive !== false).length
                : 0),
            0
          ),
        });
    }
    return packs;
  }, [businessType, templateItems]);

  const catalogCards = useMemo(() => {
    if (!catalogItems.length) return [];
    const seen = new Set<string>();
    return catalogItems
      .filter((item) => {
        const key = normalizeText(item.name);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((item) => ({
        ...item,
        alreadyExists: normalizedExistingNames.has(normalizeText(item.name)),
      }));
  }, [catalogItems, normalizedExistingNames]);

  const visibleCatalogCards = useMemo(() => {
    if (catalogSegment === "all") return catalogCards;
    return catalogCards.filter((item) => getCatalogSegment(item) === catalogSegment);
  }, [catalogCards, catalogSegment]);

  const selectableCatalogIds = useMemo(
    () =>
      visibleCatalogCards
        .filter((item) => !item.alreadyExists)
        .map((item) => item.id),
    [visibleCatalogCards],
  );

  const selectedCatalogIds = useMemo(
    () => Object.keys(catalogSelections).filter((id) => catalogSelections[id]),
    [catalogSelections],
  );

  const selectedCatalogItems = useMemo(
    () => catalogCards.filter((item) => catalogSelections[item.id]),
    [catalogCards, catalogSelections],
  );

  const selectedVisibleCatalogCount = useMemo(
    () => visibleCatalogCards.filter((item) => catalogSelections[item.id]).length,
    [visibleCatalogCards, catalogSelections],
  );

  const templateCategoryCount = useMemo(
    () => getUniqueTemplateCategoryCount(templateItems),
    [templateItems],
  );

  const templateVariantCount = useMemo(
    () =>
      templateItems.reduce(
        (sum, template) =>
          sum +
          (Array.isArray(template.variants)
            ? template.variants.filter((variant) => variant?.isActive !== false).length
            : 0),
        0,
      ),
    [templateItems],
  );

  const filteredProducts = useMemo(() => {
    if (online) return products;
    return products.filter((product) => {
      if (status === "active" && !product.isActive) return false;
      if (status === "inactive" && product.isActive) return false;
      if (query.trim()) {
        const haystack = `${product.name} ${product.category} ${product.sku ?? ""} ${product.barcode ?? ""}`;
        if (!matchesProductSearchQuery(query, haystack)) return false;
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
  const trimmedQuery = query.trim();
  const queryLooksLikeCode =
    normalizeCodeText(trimmedQuery).length >= 4 && /[0-9]/.test(trimmedQuery);
  const canOfferCatalogFallback =
    online && trimmedQuery.length > 0 && visibleProducts.length === 0;

  const selectedStockClasses = useMemo(
    () =>
      selectedProduct?.trackStock === true
        ? getStockToneClasses(getDisplayStockQty(selectedProduct))
        : UNTRACKED_STOCK_CLASSES,
    [selectedProduct]
  );
  const selectedMetrics = useMemo(
    () => getProductMetrics(selectedProduct),
    [selectedProduct]
  );
  const selectedInsight = selectedProduct
    ? productInsights[selectedProduct.id] ?? null
    : null;

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

  const handleUseQueryInCatalog = useCallback(() => {
    const nextQuery = query.trim();
    setOnboardingSection("catalog");
    setCatalogQuery(nextQuery);

    requestAnimationFrame(() => {
      catalogSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [query, setOnboardingSection]);

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

  function startHardwarePackSetup(pack: HardwareStarterPack) {
    const selected = templateItems.filter(
      (template) =>
        pack.templateIds.includes(template.id) && !template.alreadyExists
    );
    if (selected.length === 0) {
      alert("এই starter pack-এর সব পণ্য আগেই আছে।");
      return;
    }
    const nextSelections: Record<string, boolean> = {};
    selected.forEach((template) => {
      nextSelections[template.id] = true;
    });
    setOnboardingSection("starter");
    setTemplateSelections(nextSelections);
    setTemplateSetupDrafts(selected.map(buildTemplateSetupDraft));
    setTemplateSetupOpen(true);
  }

  function openTemplateSetup() {
    const selected = selectedTemplates.filter((template) => !template.alreadyExists);
    if (selected.length === 0) {
      alert("অন্তত একটি টেমপ্লেট বেছে নিন।");
      return;
    }
    setTemplateSetupDrafts(selected.map(buildTemplateSetupDraft));
    setTemplateSetupOpen(true);
  }

  function updateTemplateSetupDraft(
    templateId: string,
    patch: Partial<TemplateSetupDraft>,
  ) {
    setTemplateSetupDrafts((prev) =>
      prev.map((draft) =>
        draft.templateId === templateId ? { ...draft, ...patch } : draft
      )
    );
  }

  function updateTemplateSetupVariant(
    templateId: string,
    label: string,
    patch: Partial<TemplateSetupVariantDraft>,
  ) {
    setTemplateSetupDrafts((prev) =>
      prev.map((draft) =>
        draft.templateId !== templateId
          ? draft
          : {
              ...draft,
              variants: draft.variants.map((variant) =>
                variant.label === label ? { ...variant, ...patch } : variant
              ),
            }
      )
    );
  }

  function toggleCatalogSelection(id: string, checked: boolean) {
    setCatalogSelections((prev) => ({ ...prev, [id]: checked }));
  }

  function handleToggleAllCatalog(checked: boolean) {
    if (!checked) {
      setCatalogSelections({});
      return;
    }
    const next: Record<string, boolean> = {};
    selectableCatalogIds.forEach((id) => {
      next[id] = true;
    });
    setCatalogSelections(next);
  }

  function clearCatalogSelections() {
    setCatalogSelections({});
  }

  async function handleAddTemplates(mode: "configured" | "plain" = "configured") {
    if (!canCreateProducts) {
      alert("পণ্য যোগ করার অনুমতি নেই।");
      return;
    }
    if (addingTemplates) return;

    const selected =
      mode === "configured"
        ? templateItems.filter((template) =>
            templateSetupDrafts.some((draft) => draft.templateId === template.id)
          )
        : selectedTemplates.filter((template) => !template.alreadyExists);
    if (selected.length === 0) {
      alert("অন্তত একটি আইটেম বেছে নিন।");
      return;
    }

    const setupMap = new Map(
      templateSetupDrafts.map((draft) => [
        draft.templateId,
        {
          templateId: draft.templateId,
          buyPrice: draft.hasVariants ? null : draft.buyPrice.trim() || null,
          openingStock: draft.hasVariants
            ? null
            : draft.openingStock.trim() || null,
          variants: draft.hasVariants
            ? draft.variants.map((variant) => ({
                label: variant.label,
                buyPrice: variant.buyPrice.trim() || null,
                openingStock: variant.openingStock.trim() || null,
              }))
            : [],
        },
      ])
    );

    setAddingTemplates(true);
    triggerHaptic("medium");

    try {
      if (online) {
        const result = await addBusinessProductTemplatesToShop({
          shopId: activeShopId,
          templateIds: selected.map((template) => template.id),
          setups: mode === "configured" ? Array.from(setupMap.values()) : [],
        });
        const createdCount = result?.createdCount ?? 0;
        const skippedCount = result?.skippedCount ?? 0;
        const inactiveCount = result?.inactiveCount ?? 0;

        setTemplateSelections({});
        setTemplateSetupDrafts([]);
        setTemplateSetupOpen(false);
        router.refresh();

        const parts = [`${createdCount}টি পণ্য যোগ হয়েছে`];
        if (skippedCount) parts.push(`${skippedCount}টি বাদ গেছে`);
        if (inactiveCount)
          parts.push(`${inactiveCount}টি দাম না থাকায় নিষ্ক্রিয় হিসেবে যোগ হয়েছে`);
        alert(parts.join(". "));
        return;
      }

      const existingNames = new Set(normalizedExistingNames);
      const now = Date.now();
      const localProducts: LocalProduct[] = [];
      let skipped = 0;
      let inactiveCount = 0;
      const usedBarcodes = new Set(
        products
          .map((product) => normalizeText(product.barcode ?? ""))
          .filter(Boolean),
      );

        for (const template of selected) {
          const draft = setupMap.get(template.id);
          const draftSource = templateSetupDrafts.find(
            (row) => row.templateId === template.id
          );
          const key = normalizeText(template.name);
          if (!key || existingNames.has(key)) {
            skipped += 1;
            continue;
          }
          existingNames.add(key);
          const defaultPrice = template.defaultSellPrice?.toString();
          const numericPrice = defaultPrice ? Number(defaultPrice) : 0;
          const hasVariantPrice = Array.isArray(template.variants)
            ? template.variants.some((variant) => {
                const variantPrice = Number(variant.sellPrice ?? 0);
                return (
                  variant.isActive !== false &&
                  Number.isFinite(variantPrice) &&
                  variantPrice > 0
                );
              })
            : false;
          const hasValidPrice =
            (Number.isFinite(numericPrice) && numericPrice > 0) || hasVariantPrice;
          if (!hasValidPrice) inactiveCount += 1;
          const variants = Array.isArray(template.variants)
            ? template.variants
                .map((variant, index) => ({
                  label: String(variant.label || "").trim(),
                  buyPrice:
                    draft?.variants?.find((row) => row.label === String(variant.label || "").trim())
                      ?.buyPrice ??
                    variant.buyPrice?.toString?.() ??
                    null,
                  sellPrice: String(variant.sellPrice ?? "0").trim() || "0",
                  stockQty:
                    draft?.variants?.find((row) => row.label === String(variant.label || "").trim())
                      ?.openingStock ??
                    variant.openingStock?.toString?.() ??
                    "0",
                  sku: variant.sku ?? null,
                  barcode: variant.barcode ?? null,
                  sortOrder:
                    Number.isFinite(Number(variant.sortOrder)) &&
                    Number(variant.sortOrder) >= 0
                      ? Number(variant.sortOrder)
                      : index,
                  isActive: variant.isActive !== false,
                }))
                .filter((variant) => variant.label.length > 0)
            : [];
          const fallbackVariantPrice = variants.find(
            (variant) => Number(variant.sellPrice) > 0,
          )?.sellPrice;
          const normalizedBarcode = normalizeText(template.defaultBarcode ?? "");
          const resolvedBarcode =
            normalizedBarcode && !usedBarcodes.has(normalizedBarcode)
              ? (template.defaultBarcode ?? null)
              : null;
          if (resolvedBarcode) usedBarcodes.add(normalizedBarcode);

          localProducts.push({
            id: crypto.randomUUID(),
            shopId: activeShopId,
            name: template.name,
            category: template.category || "বিভাগহীন",
            sku: null,
            barcode: resolvedBarcode,
            baseUnit: template.defaultBaseUnit || "pcs",
            buyPrice:
              draftSource?.hasVariants
                ? null
                : draftSource?.buyPrice?.trim() || template.defaultBuyPrice || null,
            sellPrice: defaultPrice || fallbackVariantPrice || "0",
            stockQty:
              draftSource?.hasVariants
                ? "0"
                : draftSource?.openingStock?.trim() ||
                  template.defaultOpeningStock ||
                  "0",
            isActive: hasValidPrice,
            trackStock: template.defaultTrackStock === true,
            size: template.packSize ?? null,
            variants,
            updatedAt: now,
            syncStatus: "new",
          });
        }

      if (localProducts.length === 0) {
        alert("নির্বাচিত সব আইটেম এই দোকানে আগেই আছে।");
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
          sku: item.sku ?? null,
          barcode: item.barcode ?? null,
          baseUnit: item.baseUnit || "pcs",
          buyPrice: item.buyPrice ?? null,
          sellPrice: item.sellPrice,
          stockQty: item.stockQty,
          trackStock: item.trackStock ?? false,
          isActive: item.isActive,
          variants: Array.isArray(item.variants) ? item.variants : [],
          createdAt: item.updatedAt.toString(),
        })),
        ...prev,
      ]);

      setTemplateSelections({});
      setTemplateSetupDrafts([]);
      setTemplateSetupOpen(false);
      const parts = [`${localProducts.length}টি পণ্য অফলাইনে যোগ হয়েছে`];
      if (skipped) parts.push(`${skipped}টি বাদ গেছে`);
      if (inactiveCount)
        parts.push(`${inactiveCount}টি দাম না থাকায় নিষ্ক্রিয় হিসেবে যোগ হয়েছে`);
      parts.push("অনলাইনে এলে সিঙ্ক হবে।");
      alert(parts.join(". "));
    } catch (err) {
      handlePermissionError(err);
      console.error("Add templates failed", err);
      const message =
        err instanceof Error && err.message
          ? err.message
          : "টেমপ্লেট যোগ করা যায়নি";
      alert(message);
    } finally {
      setAddingTemplates(false);
    }
  }

  async function handleAddCatalogProducts() {
    if (!canCreateProducts) {
      alert("পণ্য যোগ করার অনুমতি নেই।");
      return;
    }
    if (addingCatalog) return;

    const selected = selectedCatalogItems.filter((item) => !item.alreadyExists);
    if (selected.length === 0) {
      alert("অন্তত একটি ক্যাটালগ আইটেম বেছে নিন।");
      return;
    }

    setAddingCatalog(true);
    triggerHaptic("medium");

    try {
      if (online) {
        const result = await addCatalogProductsToShop({
          shopId: activeShopId,
          catalogProductIds: selected.map((item) => item.id),
        });
        const createdCount = result?.createdCount ?? 0;
        const skippedCount = result?.skippedCount ?? 0;
        const inactiveCount = result?.inactiveCount ?? 0;
        const adjustedCodeCount = result?.adjustedCodeCount ?? 0;

        setCatalogSelections({});
        router.refresh();

        const parts = [`${createdCount}টি ক্যাটালগ পণ্য যোগ হয়েছে`];
        if (skippedCount) parts.push(`${skippedCount}টি বাদ গেছে`);
        if (inactiveCount) {
          parts.push(`${inactiveCount}টি দাম না থাকায় নিষ্ক্রিয় হিসেবে যোগ হয়েছে`);
        }
        if (adjustedCodeCount) {
          parts.push(`${adjustedCodeCount}টি বারকোড সামঞ্জস্য করা হয়েছে`);
        }
        alert(parts.join(". "));
        return;
      }

      const existingNames = new Set(normalizedExistingNames);
      const now = Date.now();
      const localProducts: LocalProduct[] = [];
      let skipped = 0;
      let inactiveCount = 0;
      let adjustedCodeCount = 0;
      const usedBarcodes = new Set(
        products
          .map((product) => normalizeCodeText(product.barcode))
          .filter(Boolean),
      );

      for (const item of selected) {
        const key = normalizeText(item.name);
        if (!key || existingNames.has(key)) {
          skipped += 1;
          continue;
        }
        existingNames.add(key);

        const sellPrice = item.latestPrice?.toString?.() || "0";
        const numericPrice = Number(sellPrice);
        const hasValidPrice = Number.isFinite(numericPrice) && numericPrice > 0;
        if (!hasValidPrice) inactiveCount += 1;

        let resolvedBarcode: string | null = null;
        for (const barcodeItem of item.barcodes ?? []) {
          const normalizedBarcode = normalizeCodeText(barcodeItem.code);
          if (!normalizedBarcode) continue;
          if (usedBarcodes.has(normalizedBarcode)) {
            adjustedCodeCount += 1;
            continue;
          }
          resolvedBarcode = normalizedBarcode;
          usedBarcodes.add(normalizedBarcode);
          break;
        }

        localProducts.push({
          id: crypto.randomUUID(),
          shopId: activeShopId,
          catalogProductId: item.id,
          productSource: "catalog",
          name: item.name,
          category: item.category || "বিভাগহীন",
          sku: null,
          barcode: resolvedBarcode,
          baseUnit: item.defaultBaseUnit || "pcs",
          buyPrice: null,
          sellPrice,
          stockQty: "0",
          isActive: hasValidPrice,
          trackStock: false,
          size: item.packSize ?? null,
          updatedAt: now,
          syncStatus: "new",
        });
      }

      if (localProducts.length === 0) {
        alert("নির্বাচিত সব ক্যাটালগ আইটেম এই দোকানে আগেই আছে।");
        return;
      }

      await db.transaction("rw", db.products, db.queue, async () => {
        await db.products.bulkPut(localProducts);
        await Promise.all(
          localProducts.map((item) => queueAdd("product", "create", item)),
        );
      });

      setProducts((prev) => [
        ...localProducts.map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          sku: item.sku ?? null,
          barcode: item.barcode ?? null,
          baseUnit: item.baseUnit || "pcs",
          buyPrice: item.buyPrice ?? null,
          sellPrice: item.sellPrice,
          stockQty: item.stockQty,
          trackStock: item.trackStock ?? false,
          isActive: item.isActive,
          variants: Array.isArray(item.variants) ? item.variants : [],
          createdAt: item.updatedAt.toString(),
        })),
        ...prev,
      ]);

      setCatalogSelections({});
      const parts = [`${localProducts.length}টি ক্যাটালগ পণ্য অফলাইনে যোগ হয়েছে`];
      if (skipped) parts.push(`${skipped}টি বাদ গেছে`);
      if (inactiveCount) {
        parts.push(`${inactiveCount}টি দাম না থাকায় নিষ্ক্রিয় হিসেবে যোগ হয়েছে`);
      }
      if (adjustedCodeCount) {
        parts.push(`${adjustedCodeCount}টি বারকোড সামঞ্জস্য করা হয়েছে`);
      }
      parts.push("অনলাইনে এলে সিঙ্ক হবে।");
      alert(parts.join(". "));
    } catch (err) {
      handlePermissionError(err);
      console.error("Add catalog products failed", err);
      const message =
        err instanceof Error && err.message
          ? err.message
          : "ক্যাটালগ পণ্য যোগ করা যায়নি";
      alert(message);
    } finally {
      setAddingCatalog(false);
    }
  }

  const handleDelete = useCallback(
    async (id: string) => {
      if (!canDeleteProducts) {
        alert("পণ্য মুছার অনুমতি নেই।");
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
            p.id === id ? { ...p, isActive: false, trackStock: false } : p
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
    if (listening) return;
    const SpeechRecognitionImpl = getSpeechRecognitionCtor();
    if (!SpeechRecognitionImpl) {
      setVoiceReady(false);
      setVoiceError("এই ব্রাউজারে ভয়েস সার্চ সমর্থিত নয়।");
      return;
    }

    setVoiceError(null);
    triggerHaptic("light");
    voiceStopRequestedRef.current = false;
    recognitionRef.current?.stop?.();
    recognitionRef.current?.abort?.();

    const recognition: SpeechRecognitionInstance = new SpeechRecognitionImpl();
    recognition.lang = VOICE_LANG_BY_MODE[voiceMode];
    recognition.interimResults = false;
    recognition.continuous = false;
    (recognition as any).maxAlternatives = 3;

    recognition.onresult = (event: any) => {
      const transcript = String(event?.results?.[0]?.[0]?.transcript || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!transcript) return;
      setQuery(transcript);
      setSearchExpanded(true);
      triggerHaptic("medium");
      setVoiceError(null);
    };

    recognition.onerror = (event: any) => {
      const errorCode =
        typeof event?.error === "string" ? (event.error as string) : null;
      if (
        voiceStopRequestedRef.current ||
        errorCode === "aborted"
      ) {
        return;
      }
      if (
        errorCode === "not-allowed" ||
        errorCode === "denied" ||
        errorCode === "service-not-allowed"
      ) {
        setVoiceError("মাইক্রোফোন অ্যাক্সেস পাওয়া যায়নি।");
        return;
      }
      if (errorCode === "no-speech") {
        setVoiceError(
          voiceMode === "bn"
            ? "বাংলায় আবার পরিষ্কার করে বলুন।"
            : "ইংরেজিতে পণ্যের নাম পরিষ্কার করে আবার বলুন।"
        );
        return;
      }
      const fallbackMessage = mapVoiceErrorBangla("unavailable");
      setVoiceError(errorCode ? `${fallbackMessage} (${errorCode})` : fallbackMessage);
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
      voiceStopRequestedRef.current = false;
      setListening(false);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setVoiceError("ভয়েস সার্চ শুরু করা যায়নি।");
      return;
    }
    setListening(true);
  }

  function stopListening() {
    voiceStopRequestedRef.current = true;
    recognitionRef.current?.stop?.();
    recognitionRef.current?.abort?.();
    recognitionRef.current = null;
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
          {/* Title row */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                পণ্য
              </p>
              <p className="text-3xl font-bold tabular-nums leading-tight text-foreground sm:text-4xl">
                {Number(effectiveTotalCount).toLocaleString("bn-BD")}
              </p>
              <p className="text-xs text-muted-foreground">
                {activeShopName}
              </p>
            </div>
            <Link
              href={`/dashboard/products/new?shopId=${activeShopId}`}
              onClick={() => triggerHaptic("medium")}
              className="inline-flex h-9 shrink-0 items-center rounded-full bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold shadow-sm hover:bg-primary/15 hover:border-primary/40 transition-colors"
            >
              + নতুন পণ্য
            </Link>
          </div>

          {/* Shop selector */}
          <ShopSwitcherClient
            shops={shops}
            activeShopId={activeShopId}
            query={query}
            status={status}
          />

          {/* Chips */}
          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3 text-xs">
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
              <RefreshIconButton
                onClick={handleRefresh}
                loading={isRefreshing}
                label="রিফ্রেশ"
                className="h-7 px-2.5 text-xs"
              />
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
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
                className="w-full h-12 pl-11 pr-36 text-base border border-border rounded-xl bg-card shadow-sm focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition sm:pr-40"
              />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">
                🔍
              </span>
              <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-2">
                {voiceReady ? (
                  <>
                    <div className="inline-flex h-9 items-center rounded-full border border-primary/20 bg-primary-soft/60 p-1 shadow-sm">
                      <button
                        type="button"
                        aria-pressed={voiceMode === "bn"}
                        onClick={() => {
                          setVoiceMode("bn");
                          setVoiceError(null);
                        }}
                        className={`inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-semibold transition ${
                          voiceMode === "bn"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-primary"
                        }`}
                      >
                        বাংলা
                      </button>
                      <button
                        type="button"
                        aria-pressed={voiceMode === "en"}
                        onClick={() => {
                          setVoiceMode("en");
                          setVoiceError(null);
                        }}
                        className={`inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-semibold transition ${
                          voiceMode === "en"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-primary"
                        }`}
                      >
                        EN
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={listening ? stopListening : startListening}
                      aria-label={
                        listening
                          ? "ভয়েস সার্চ বন্ধ করুন"
                          : voiceMode === "bn"
                          ? "বাংলায় ভয়েস সার্চ চালু করুন"
                          : "ইংরেজিতে ভয়েস সার্চ চালু করুন"
                      }
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-semibold transition ${
                        listening
                          ? "animate-pulse border-primary/40 bg-primary-soft text-primary"
                          : "border-primary/30 bg-primary-soft text-primary active:scale-95"
                      }`}
                    >
                      {listening ? "🔴" : "🎤"}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            {(listening || voiceError) && (
              <div className="flex items-center justify-between gap-2 px-1">
                <span
                  className={`inline-flex min-h-7 items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${
                    listening
                      ? "border-primary/30 bg-primary-soft text-primary"
                      : "border-danger/20 bg-danger-soft text-danger"
                  }`}
                >
                  {listening
                    ? voiceMode === "bn"
                      ? "বাংলা শুনছে..."
                      : "ইংরেজি শুনছে..."
                    : voiceError}
                </span>
              </div>
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

      {hardwareStarterPacks.length > 0 && (
        <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card p-4 shadow-sm sm:p-5">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.09),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(245,158,11,0.08),transparent_28%)]" />
          <div className="relative space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary">
                    ১. দ্রুত শুরু
                  </span>
                  <span className="inline-flex items-center rounded-full border border-border bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    নতুন hardware shop-এর shortest path
                  </span>
                </div>
                <h3 className="mt-1 text-lg font-bold text-foreground sm:text-xl">
                  হার্ডওয়্যার দোকানের স্টার্টার প্যাক
                </h3>
                <p className="mt-1 max-w-2xl text-xs text-muted-foreground sm:text-sm">
                  blank list থেকে শুরু না করে popular hardware set বেছে নিন। setup drawer-এ
                  stock আর ক্রয়মূল্য দিয়েই operational-ready product list বানাতে পারবেন।
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary-soft px-3 py-1 text-[11px] font-semibold text-primary">
                  {hardwareStarterPacks.length.toLocaleString("bn-BD")}টি starter path
                </span>
                <button
                  type="button"
                  aria-expanded={starterPackOpen}
                  aria-controls="hardware-starter-pack-section"
                  onClick={() =>
                    setOnboardingSection(starterPackOpen ? null : "starter")
                  }
                  className="inline-flex h-8 items-center gap-2 rounded-full border border-border bg-background px-3 text-xs font-semibold text-foreground shadow-sm transition hover:bg-muted hover:border-primary/30"
                >
                  {starterPackOpen ? "লুকান" : "দেখান"}
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={`h-3.5 w-3.5 transition-transform ${
                      starterPackOpen ? "rotate-180" : ""
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
            </div>

            {!starterPackOpen ? (
              <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    নতুন hardware shop হলে এখান থেকে quickest setup শুরু করা যাবে।
                    অন্যথায় নিচের template বা catalog section ব্যবহার করুন।
                  </p>
                  <div className="flex flex-wrap gap-2 text-[11px] font-medium text-muted-foreground">
                    <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1">
                      {hardwareStarterPacks.reduce((sum, pack) => sum + pack.productCount, 0).toLocaleString("bn-BD")}টি মোট পণ্য
                    </span>
                    <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1">
                      {hardwareStarterPacks.reduce((sum, pack) => sum + pack.variantCount, 0).toLocaleString("bn-BD")}টি ভ্যারিয়েন্ট
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div
                id="hardware-starter-pack-section"
                className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3 animate-fade-in"
              >
                {hardwareStarterPacks.map((pack) => (
                  <div
                    key={pack.id}
                    className={`rounded-2xl border border-border/70 bg-gradient-to-br ${pack.accent} p-4 shadow-[0_6px_18px_rgba(15,23,42,0.05)]`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="text-base font-bold text-foreground">
                          {pack.title}
                        </h4>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {pack.subtitle}
                        </p>
                      </div>
                      <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-foreground">
                        {pack.productCount.toLocaleString("bn-BD")}টি পণ্য
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center rounded-full border border-border bg-white/75 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {pack.variantCount.toLocaleString("bn-BD")}টি ভ্যারিয়েন্ট
                      </span>
                      {pack.sampleNames.map((name) => (
                        <span
                          key={`${pack.id}:${name}`}
                          className="inline-flex items-center rounded-full border border-border bg-white/75 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                        >
                          {name}
                        </span>
                      ))}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2">
                      <p className="text-[11px] text-muted-foreground">
                        আগে preview, তারপর stock/cost setup
                      </p>
                      <button
                        type="button"
                        onClick={() => startHardwarePackSetup(pack)}
                        disabled={!canCreateProducts || addingTemplates}
                        className="inline-flex h-9 items-center justify-center rounded-full border border-primary/30 bg-primary-soft px-4 text-xs font-semibold text-primary shadow-sm hover:bg-primary/15 hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        এই সেটআপ নিন
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {templateItems.length > 0 && (
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-card to-card" />
          <div className="relative">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary">
                  ২. টেমপ্লেট
                </span>
                <span className="inline-flex items-center rounded-full border border-border bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  bulk add + setup
                </span>
              </div>
              <h3 className="text-sm font-semibold text-foreground truncate sm:text-base">
                {businessLabel} এর কমন পণ্য
              </h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground leading-tight sm:text-xs sm:leading-relaxed">
                একসাথে অনেক পণ্য যোগ করুন। চাইলে স্টক আর ক্রয়মূল্য সেট করেই যোগ করতে পারবেন।
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {selectedTemplateIds.length > 0 && (
                  <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {selectedTemplateIds.length.toLocaleString("bn-BD")}টি বাছাই
                  </span>
                )}
                <span className="inline-flex items-center rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                  setup review করুন
                </span>
              </div>
            </div>
            <button
              type="button"
              aria-expanded={templateOpen}
              aria-controls="product-template-section"
              onClick={() =>
                setOnboardingSection(templateOpen ? null : "template")
              }
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

          {!templateOpen ? (
            <div className="mt-3 rounded-xl border border-border/70 bg-background/70 px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  bulk product add করতে চাইলে template section ব্যবহার করুন। stock আর
                  ক্রয়মূল্য সেট করেও যোগ করা যাবে।
                </p>
                <div className="flex flex-wrap gap-2 text-[11px] font-medium text-muted-foreground">
                  <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1">
                    {templateItems.length.toLocaleString("bn-BD")}টি template
                  </span>
                  <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1">
                    {templateVariantCount.toLocaleString("bn-BD")}টি ভ্যারিয়েন্ট
                  </span>
                  <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1">
                    {templateCategoryCount.toLocaleString("bn-BD")}টি ক্যাটাগরি
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div id="product-template-section" className="mt-3 space-y-2 animate-fade-in">
              <div className="rounded-xl border border-border/70 bg-background/80 p-2.5 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
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
                      onClick={openTemplateSetup}
                      disabled={
                        !canCreateProducts ||
                        addingTemplates ||
                        selectedTemplates.length === 0
                      }
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-full border border-primary/30 bg-primary-soft px-4 text-xs font-semibold text-primary shadow-sm hover:bg-primary/15 hover:border-primary/40 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {addingTemplates ? "যোগ হচ্ছে..." : "সেটআপ করে যোগ করুন"}
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
                  const activeVariants = Array.isArray(template.variants)
                    ? template.variants
                        .filter((variant) => variant?.isActive !== false)
                        .sort(
                          (left, right) =>
                            (Number(left.sortOrder ?? 0) || 0) -
                            (Number(right.sortOrder ?? 0) || 0),
                        )
                    : [];
                  const variantCount = activeVariants.length;
                  const minVariantPrice =
                    variantCount > 0
                      ? Math.min(
                          ...activeVariants
                            .map((variant) => Number(variant.sellPrice ?? 0))
                            .filter((value) => Number.isFinite(value) && value > 0),
                        )
                      : NaN;
                  const hasVariantStartingPrice =
                    Number.isFinite(minVariantPrice) && minVariantPrice > 0;
                  const priceLabel = hasPrice
                    ? `৳ ${formatTemplatePrice(template.defaultSellPrice)}`
                    : hasVariantStartingPrice
                    ? `শুরু ৳${formatTemplatePrice(minVariantPrice)}`
                    : "দাম নেই";
                  const priceTone = hasPrice || hasVariantStartingPrice
                    ? "border-primary/20 bg-primary-soft text-primary"
                    : "border-warning/30 bg-warning/10 text-warning";
                  const unitLabel = (template.defaultBaseUnit || "pcs").toLowerCase();
                  const aliasPreview = Array.isArray(template.aliases)
                    ? template.aliases.filter(Boolean).slice(0, 3)
                    : [];
                  return (
                    <label
                      key={template.id}
                      className={`block rounded-xl border p-3 shadow-[0_1px_0_rgba(0,0,0,0.02)] transition-all duration-200 ${
                        disabled
                          ? "border-border bg-muted/50 text-muted-foreground"
                          : checked
                          ? "border-primary/40 bg-primary-soft/50 shadow-[0_8px_24px_rgba(16,185,129,0.08)]"
                          : "border-border bg-card hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            toggleTemplateSelection(template.id, event.target.checked)
                          }
                          disabled={disabled}
                          className="mt-1 h-4 w-4 shrink-0"
                        />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <p className="truncate text-sm font-semibold text-foreground">
                                  {template.name}
                                </p>
                                {template.brand ? (
                                  <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    {template.brand}
                                  </span>
                                ) : null}
                                {Number(template.popularityScore ?? 0) > 0 ? (
                                  <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary">
                                    {template.popularityScore}
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  {template.category || "Uncategorized"}
                                </span>
                                <span className="inline-flex items-center rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                                  সেটআপ লাগবে
                                </span>
                                {template.packSize ? (
                                  <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    {template.packSize}
                                  </span>
                                ) : null}
                                <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  ইউনিট: {unitLabel}
                                </span>
                                <span
                                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                    template.defaultTrackStock
                                      ? "border-primary/20 bg-primary-soft text-primary"
                                      : "border-border bg-muted/40 text-muted-foreground"
                                  }`}
                                >
                                  {template.defaultTrackStock ? "স্টক অন" : "স্টক অফ"}
                                </span>
                                {template.defaultBarcode ? (
                                  <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium font-mono text-muted-foreground">
                                    {template.defaultBarcode}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="shrink-0 space-y-1 text-right">
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${priceTone}`}
                              >
                                {priceLabel}
                              </span>
                              {template.alreadyExists ? (
                                <span className="block text-[10px] font-semibold text-muted-foreground">
                                  আগে থেকেই আছে
                                </span>
                              ) : null}
                            </div>
                          </div>
                          {variantCount > 0 ? (
                            <div className="rounded-lg border border-border/70 bg-background/70 p-2">
                              <div className="mb-1 flex items-center justify-between">
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  ভ্যারিয়েন্ট
                                </span>
                                <span className="text-[10px] font-semibold text-foreground">
                                  {variantCount} টি
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {activeVariants.slice(0, 3).map((variant, index) => {
                                  const label = String(variant.label || "").trim();
                                  const price = formatTemplatePrice(variant.sellPrice ?? "");
                                  return (
                                    <span
                                      key={`${template.id}-variant-${index}`}
                                      className="inline-flex items-center rounded-full border border-primary/20 bg-primary-soft/70 px-2 py-0.5 text-[10px] font-medium text-primary"
                                    >
                                      {price ? `${label} ৳${price}` : label}
                                    </span>
                                  );
                                })}
                                {variantCount > 3 ? (
                                  <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    +{variantCount - 3} আরো
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                          {aliasPreview.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {aliasPreview.map((alias) => (
                                <span
                                  key={`${template.id}-alias-${alias}`}
                                  className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                                >
                                  {alias}
                                </span>
                              ))}
                              {Array.isArray(template.aliases) &&
                              template.aliases.length > aliasPreview.length ? (
                                <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  +{template.aliases.length - aliasPreview.length} বিকল্প নাম
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          </div>
        </div>
      )}

      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-success/5 via-card to-card" />
        <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary">
                ৩. ক্যাটালগ
              </span>
              <span className="inline-flex items-center rounded-full border border-border bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                extra product library
              </span>
            </div>
            <h3 className="text-sm font-semibold text-foreground truncate sm:text-base">
              Catalog থেকে যোগ করুন
            </h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground leading-tight sm:text-xs sm:leading-relaxed">
              নাম বা বারকোড খুঁজে প্রস্তুত catalog item shop-এ যোগ করুন।
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {selectedCatalogIds.length > 0 && (
                <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {selectedCatalogIds.length.toLocaleString("bn-BD")}টি বাছাই
                </span>
              )}
              <span className="inline-flex items-center rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                import-এর পর stock/cost দিন
              </span>
            </div>
          </div>
          <button
            type="button"
            aria-expanded={catalogOpen}
            aria-controls="product-catalog-section"
            onClick={() =>
              setOnboardingSection(catalogOpen ? null : "catalog")
            }
            className="inline-flex h-8 items-center gap-2 rounded-full border border-border bg-background px-3 text-xs font-semibold text-foreground shadow-sm transition hover:bg-muted hover:border-primary/30"
          >
            {catalogOpen ? "লুকান" : "দেখান"}
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`h-3.5 w-3.5 transition-transform ${
                catalogOpen ? "rotate-180" : ""
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

        {!catalogOpen ? (
          <div className="mt-3 rounded-xl border border-border/70 bg-background/70 px-4 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                extra product library থেকে বেছে নিতে চাইলে catalog section খুলুন।
                existing product না থাকলে search-driven import এখানেই পাবেন।
              </p>
              <div className="flex flex-wrap gap-2 text-[11px] font-medium text-muted-foreground">
                <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1">
                  {catalogCards.length.toLocaleString("bn-BD")}টি available
                </span>
                <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1">
                  {selectedCatalogItems.length.toLocaleString("bn-BD")}টি বাছাই
                </span>
                {businessType === "hardware" ? (
                  <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1">
                    hardware filters ready
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div
            id="product-catalog-section"
            ref={catalogSectionRef}
            className="mt-3 space-y-3 animate-fade-in"
          >
            <div className="overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-sky-50 via-background to-primary-soft/30 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
              <div className="border-b border-border/60 px-3 py-3 sm:px-4">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary-soft px-3 py-1 text-[11px] font-semibold text-primary">
                        হার্ডওয়্যার ক্যাটালগ
                      </span>
                      <h3 className="mt-2 text-base font-semibold text-foreground">
                        লাইব্রেরি থেকে পণ্য বেছে দোকানে আনুন
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        স্টার্টার প্যাকের বাইরে extra item লাগলে এখান থেকে বেছে নিন।
                        যোগ হওয়ার পর স্টক ও ক্রয়মূল্য আলাদা করে পূরণ করতে পারবেন।
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px] font-medium text-muted-foreground">
                      <span className="inline-flex items-center rounded-full border border-border bg-background/80 px-2.5 py-1">
                        দেখা যাচ্ছে {visibleCatalogCards.length.toLocaleString("bn-BD")}টি
                      </span>
                      <span className="inline-flex items-center rounded-full border border-border bg-background/80 px-2.5 py-1">
                        দেখা যাচ্ছে বাছাই {selectedVisibleCatalogCount.toLocaleString("bn-BD")}টি
                      </span>
                    </div>
                  </div>

                  {businessType === "hardware" ? (
                    <div className="flex flex-wrap gap-2">
                      {HARDWARE_CATALOG_FILTERS.map((filter) => {
                        const active = catalogSegment === filter.id;
                        return (
                          <button
                            key={filter.id}
                            type="button"
                            onClick={() => setCatalogSegment(filter.id)}
                            className={`inline-flex h-8 items-center rounded-full border px-3 text-[11px] font-semibold transition ${
                              active
                                ? "border-primary/30 bg-primary-soft text-primary shadow-sm"
                                : "border-border bg-background/80 text-muted-foreground hover:border-primary/20 hover:text-foreground"
                            }`}
                          >
                            {filter.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3 px-3 py-3 sm:px-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="search"
                  value={catalogQuery}
                  onChange={(event) => setCatalogQuery(event.target.value)}
                  placeholder={
                    businessType === "hardware"
                      ? "নাম, ব্র্যান্ড, ক্যাটাগরি, বিকল্প নাম, বারকোড"
                      : "নাম, ব্র্যান্ড, ক্যাটাগরি, বিকল্প নাম, বারকোড"
                  }
                  className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-primary/40"
                />
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={
                        selectableCatalogIds.length > 0 &&
                        selectableCatalogIds.every((id) => catalogSelections[id])
                      }
                      onChange={(event) =>
                        handleToggleAllCatalog(event.target.checked)
                      }
                      disabled={!canCreateProducts || selectableCatalogIds.length === 0}
                      className="h-4 w-4"
                    />
                    <span>দেখানো সব</span>
                  </label>
                  {selectedCatalogIds.length > 0 && (
                    <button
                      type="button"
                      onClick={clearCatalogSelections}
                      className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                    >
                      মুছুন
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleAddCatalogProducts}
                    disabled={
                      !canCreateProducts ||
                      addingCatalog ||
                      selectedCatalogItems.length === 0
                    }
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-primary/30 bg-primary-soft px-4 text-xs font-semibold text-primary shadow-sm hover:bg-primary/15 hover:border-primary/40 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {addingCatalog ? "যোগ হচ্ছে..." : "ক্যাটালগ থেকে যোগ করুন"}
                  </button>
                </div>
              </div>
              {!online ? (
                <p className="text-xs text-muted-foreground">
                  অফলাইনে আছেন। অনলাইনে এলে ক্যাটালগ থেকে নতুন পণ্য খুঁজে নেওয়া যাবে।
                </p>
              ) : null}
              {canOfferCatalogFallback && catalogQuery.trim() !== trimmedQuery ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary-soft/40 px-3 py-2">
                  <p className="text-xs text-foreground">
                    {queryLooksLikeCode
                      ? "এই বারকোড বা SKU shop-এ মেলেনি। catalog-এ কাছাকাছি match খুঁজে দেখতে পারেন।"
                      : "লোকাল পণ্য না পেলে catalog-এর নাম বা বিকল্প নাম দিয়েও খুঁজে import করতে পারেন।"}
                  </p>
                  <button
                    type="button"
                    onClick={handleUseQueryInCatalog}
                    className="inline-flex h-7 items-center justify-center rounded-full border border-primary/30 bg-background px-3 text-[11px] font-semibold text-primary hover:bg-primary/10"
                  >
                    এই search ব্যবহার করুন
                  </button>
                </div>
              ) : null}
              {catalogError ? (
                <p className="text-xs text-danger">{catalogError}</p>
              ) : null}
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
                    যোগ হওয়ার পর স্টক দিন
                  </span>
                  <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 font-medium text-sky-700">
                    ক্রয়মূল্য পরে দিন
                  </span>
                  <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                    বারকোড থাকলে স্ক্যান সহজ হবে
                  </span>
                </div>
              </div>
            </div>

            {!canCreateProducts && (
              <div className="text-xs text-warning">পণ্য যোগ করার অনুমতি নেই।</div>
            )}

            {online && catalogLoading ? (
              <div className="rounded-xl border border-border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                ক্যাটালগ খুঁজে আনা হচ্ছে...
              </div>
            ) : null}

            {online && !catalogLoading && visibleCatalogCards.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
                {debouncedCatalogQuery.trim()
                  ? "এই search ও filter-এ কোনো ক্যাটালগ আইটেম পাওয়া যায়নি।"
                  : "এই filter-এ এখনো কোনো catalog item দেখানো যাচ্ছে না।"}
              </div>
            ) : null}

            {visibleCatalogCards.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visibleCatalogCards.map((item) => {
                  const checked = Boolean(catalogSelections[item.id]);
                  const disabled = item.alreadyExists || !canCreateProducts;
                  const aliasPreview = Array.isArray(item.aliases)
                    ? item.aliases
                        .map((alias) => alias.alias)
                        .filter(Boolean)
                        .slice(0, 3)
                    : [];
                  const barcodePreview = Array.isArray(item.barcodes)
                    ? item.barcodes.slice(0, 2)
                    : [];
                  const primaryBadge = getCatalogPrimaryBadge(item);
                  const secondaryBadges = getCatalogSecondaryBadges(item);
                  return (
                    <label
                      key={item.id}
                      className={`block rounded-2xl border p-3 shadow-[0_6px_20px_rgba(15,23,42,0.04)] transition-all duration-200 ${
                        disabled
                          ? "border-border bg-muted/50 text-muted-foreground"
                        : checked
                          ? "border-primary/40 bg-primary-soft/50 shadow-[0_10px_28px_rgba(16,185,129,0.10)]"
                          : "border-border bg-card hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            toggleCatalogSelection(item.id, event.target.checked)
                          }
                          disabled={disabled}
                          className="mt-1 h-4 w-4 shrink-0"
                        />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <p className="truncate text-sm font-semibold text-foreground">
                                  {item.name}
                                </p>
                                {item.brand ? (
                                  <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    {item.brand}
                                  </span>
                                ) : null}
                                {Number(item.popularityScore ?? 0) > 0 ? (
                                  <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary">
                                    {item.popularityScore}
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  {formatCategoryLabel(item.category || "বিভাগহীন")}
                                </span>
                                <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  ইউনিট {getBaseUnitLabel(item.defaultBaseUnit)}
                                </span>
                                {item.packSize ? (
                                  <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    {item.packSize}
                                  </span>
                                ) : null}
                                {item.importSource?.name ? (
                                  <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    {item.importSource.name}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="shrink-0 space-y-1 text-right">
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${primaryBadge.className}`}
                              >
                                {primaryBadge.label}
                              </span>
                              {item.alreadyExists ? (
                                <span className="block text-[10px] font-semibold text-muted-foreground">
                                  আগে থেকেই আছে
                                </span>
                              ) : null}
                            </div>
                          </div>

                          {barcodePreview.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {barcodePreview.map((barcode) => (
                                <span
                                  key={`${item.id}-barcode-${barcode.code}`}
                                  className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-[10px] font-medium text-muted-foreground"
                                >
                                  {barcode.code}
                                </span>
                              ))}
                              {Array.isArray(item.barcodes) &&
                              item.barcodes.length > barcodePreview.length ? (
                                <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  +{item.barcodes.length - barcodePreview.length} বারকোড
                                </span>
                              ) : null}
                            </div>
                          ) : null}

                          {secondaryBadges.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {secondaryBadges.map((badge) => (
                                <span
                                  key={`${item.id}-${badge.label}`}
                                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
                                >
                                  {badge.label}
                                </span>
                              ))}
                            </div>
                          ) : null}

                          {aliasPreview.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {aliasPreview.map((alias) => (
                                <span
                                  key={`${item.id}-alias-${alias}`}
                                  className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                                >
                                  {alias}
                                </span>
                              ))}
                              {Array.isArray(item.aliases) &&
                              item.aliases.length > aliasPreview.length ? (
                                <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  +{item.aliases.length - aliasPreview.length} বিকল্প নাম
                                </span>
                              ) : null}
                            </div>
                          ) : null}

                          <div className="rounded-xl border border-dashed border-border/80 bg-background/70 px-3 py-2 text-[11px] text-muted-foreground">
                            {item.alreadyExists
                              ? "এই পণ্যটি আগে থেকেই দোকানে আছে। চাইলে detail দেখে আপডেট করুন।"
                              : "যোগ করার পর স্টক, ক্রয়মূল্য এবং reorder level নিজের দোকান অনুযায়ী পূরণ করুন।"}
                          </div>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
        </div>
      </div>


      {/* Products List - Scrolls normally */}
      <div
        className={
          visibleProducts.length === 0
            ? "space-y-3"
            : "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
        }
      >
        {visibleProducts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/70 px-6 py-14 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-primary/15 bg-primary-soft/60 text-4xl shadow-[0_1px_0_rgba(0,0,0,0.03)]">
              📦
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              কোনো পণ্য পাওয়া যায়নি
            </h3>
            <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">
              {query || status !== "all"
                ? "ফিল্টার পরিবর্তন করে আবার চেষ্টা করুন"
                : "নতুন পণ্য যোগ করতে + বাটনে ক্লিক করুন"}
            </p>
            {canOfferCatalogFallback ? (
              <div className="mx-auto mt-5 max-w-lg rounded-2xl border border-primary/20 bg-primary-soft/35 px-4 py-3 space-y-2">
                <p className="text-xs leading-5 text-muted-foreground">
                  {queryLooksLikeCode
                    ? "এই বারকোড বা SKU দোকানে নেই। ক্যাটালগে খুঁজে import করা যেতে পারে।"
                    : "এই খোঁজার local result নেই। ক্যাটালগের বিকল্প নাম বা বারকোড দিয়েও খুঁজে দেখতে পারেন।"}
                </p>
                <button
                  type="button"
                  onClick={handleUseQueryInCatalog}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-primary/30 bg-background px-4 text-sm font-semibold text-primary hover:bg-primary/10 hover:border-primary/40"
                >
                  ক্যাটালগে এই search চালান
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          visibleProducts.map((product) => {
            const tracksStock = product.trackStock === true;
            const metrics = getProductMetrics(product);
            const isKpiExpanded = Boolean(expandedKpiByProductId[product.id]);
            const displayStockQty = getDisplayStockQty(product);
            const stockClasses = tracksStock
              ? getStockToneClasses(displayStockQty)
              : UNTRACKED_STOCK_CLASSES;
            const categoryLabel = formatCategoryLabel(product.category);
            const variantSummary = getVariantSummary(product);
            const stockText = formatStockText(product);
            const cardAccent = product.isActive
              ? "border-l-4 border-l-success/60"
              : "border-l-4 border-l-muted-foreground/30";
            return (
              <div
                key={product.id}
                className={`h-full min-h-[250px] bg-card rounded-2xl shadow-sm border border-border overflow-hidden transition card-lift hover:shadow-md active:scale-[0.98] ${cardAccent}`}
                onClick={() => {
                  setSelectedProduct(product);
                  setInsightError(null);
                  triggerHaptic("light");
                }}
              >
                <div className="flex h-full flex-col p-4">
                {/* Product Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0 pr-3">
                    <h3 className="text-base font-semibold text-foreground mb-1 line-clamp-2">
                      {product.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {categoryLabel}
                    </p>
                    {variantSummary ? (
                      <p className="mt-1 text-xs font-medium text-primary">
                        {variantSummary}
                      </p>
                    ) : null}
                    {product.sku || product.barcode ? (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {product.sku ? (
                          <span className="inline-flex items-center rounded-full border border-border bg-muted/35 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            SKU {product.sku}
                          </span>
                        ) : null}
                        {product.barcode ? (
                          <span className="inline-flex items-center rounded-full border border-border bg-muted/35 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            বারকোড {product.barcode}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
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
                      {stockText}
                    </p>
                  </div>
                </div>

                {product.storageLocation || product.reorderPoint || product.conversionSummary ? (
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {product.storageLocation ? (
                      <span className="inline-flex items-center rounded-full border border-border bg-muted/35 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        লোকেশন {product.storageLocation}
                      </span>
                    ) : null}
                    {product.reorderPoint ? (
                      <span className="inline-flex items-center rounded-full border border-warning/20 bg-warning-soft/40 px-2 py-0.5 text-[10px] font-medium text-warning">
                        Restock {product.reorderPoint}
                      </span>
                    ) : null}
                    {product.conversionSummary ? (
                      <span className="inline-flex items-center rounded-full border border-border bg-muted/35 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {product.conversionSummary}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <div className="mb-4 rounded-xl border border-border bg-muted/20 p-2.5 transition-all duration-200">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedKpiByProductId((prev) => ({
                        ...prev,
                        [product.id]: !prev[product.id],
                      }));
                      triggerHaptic("light");
                    }}
                    className="flex w-full items-center justify-between gap-2 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-foreground">
                        বিক্রি সারাংশ
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          আজ {formatCompactMetric(metrics.soldQtyToday)}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-success/20 bg-success-soft/70 px-2 py-0.5 text-[10px] font-semibold text-success">
                          নেট {formatCompactMetric(metrics.netQtyToday)}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-danger/20 bg-danger-soft/60 px-2 py-0.5 text-[10px] font-medium text-danger">
                          রিটার্ন {formatCompactMetric(metrics.returnedQtyToday)}
                        </span>
                      </div>
                    </div>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                        isKpiExpanded ? "rotate-180" : ""
                      }`}
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                  {isKpiExpanded && (
                    <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border/70 pt-2 animate-fade-in">
                      <div className="rounded-xl border border-border bg-card px-2.5 py-2.5">
                        <p className="text-[10px] text-muted-foreground">আজ বিক্রি</p>
                        <p className="text-sm font-semibold text-foreground">
                          {formatQty(metrics.soldQtyToday)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-danger/20 bg-danger-soft/50 px-2.5 py-2.5">
                        <p className="text-[10px] text-danger/80">আজ রিটার্ন</p>
                        <p className="text-sm font-semibold text-danger">
                          {formatQty(metrics.returnedQtyToday)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-success/20 bg-success-soft/60 px-2.5 py-2.5">
                        <p className="text-[10px] text-success/80">নেট বিক্রি</p>
                        <p className="text-sm font-semibold text-success">
                          {formatQty(metrics.netQtyToday)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-warning/25 bg-warning-soft/40 px-2.5 py-2.5">
                        <p className="text-[10px] text-warning">রিটার্ন রেট · ৩০ দিন</p>
                        <p className="text-sm font-semibold text-warning">
                          {formatPercent(metrics.returnRate30d)}%
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                {canUpdateProducts || canDeleteProducts ? (
                  <div className="mt-auto space-y-2">
                    {canUpdateProducts && product.trackStock ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAdjusting({
                            productId: product.id,
                            variantId: null,
                            productName: product.name,
                            currentQty: product.stockQty,
                          });
                          setAdjustNewQty(product.stockQty);
                          setAdjustReason("");
                          setAdjustNote("");
                          setAdjustError(null);
                        }}
                        className="flex items-center justify-center gap-2 w-full h-10 rounded-xl bg-warning-soft text-warning border border-warning/30 font-semibold text-sm shadow-sm hover:bg-warning/15 hover:border-warning/40 active:scale-95 transition"
                      >
                        <span>⚖️</span>
                        <span>স্টক ঠিক করুন</span>
                      </button>
                    ) : null}
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
                  </div>
                ) : (
                  <p className="mt-auto text-xs text-muted-foreground">
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
              পৃষ্ঠা {Number(effectivePage).toLocaleString("bn-BD")} / {Number(effectiveTotalPages).toLocaleString("bn-BD")}
            </span>
            <span className="text-sm text-muted-foreground">
              মোট {Number(effectiveTotalCount).toLocaleString("bn-BD")} টি
            </span>
          </div>

          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => handleNavigate(effectivePage - 1)}
              disabled={effectivePage <= 1}
              className="flex items-center justify-center w-10 h-10 rounded-full border border-border text-muted-foreground font-medium shadow-sm disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition"
            >
              {"<"}
            </button>

            <div className="flex gap-1.5 overflow-x-auto max-w-[200px]">
              {pageNumbers.map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => handleNavigate(pageNumber)}
                  className={`flex-shrink-0 w-10 h-10 rounded-full font-semibold text-sm transition active:scale-95 ${
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
              className="flex items-center justify-center w-10 h-10 rounded-full border border-border text-muted-foreground font-medium shadow-sm disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition"
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
                <div className="flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    {formatCategoryLabel(selectedProduct.category)}
                  </span>
                  {getVariantSummary(selectedProduct) ? (
                    <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary-soft/80 px-2.5 py-1 text-[11px] font-semibold text-primary">
                      {getVariantSummary(selectedProduct)}
                    </span>
                  ) : null}
                  {selectedProduct.barcode ? (
                    <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                      বারকোড {selectedProduct.barcode}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-primary/30 bg-primary-soft p-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
                  <p className="text-xs font-medium text-primary mb-1">
                    বিক্রয় মূল্য
                  </p>
                  <p className="text-2xl font-bold text-foreground">
                    ৳ {selectedProduct.sellPrice}
                  </p>
                </div>
                {selectedProduct.buyPrice && (
                  <div className="rounded-xl border border-success/30 bg-success-soft p-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
  <p className="text-xs font-medium text-success mb-1">
    ক্রয় মূল্য
                    </p>
                    <p className="text-2xl font-bold text-foreground">
                      ৳ {selectedProduct.buyPrice}
                    </p>
                  </div>
                )}
                <div className={`rounded-xl border p-4 shadow-[0_1px_0_rgba(0,0,0,0.02)] ${selectedStockClasses.card}`}>
                  <p className={`text-xs font-medium mb-1 ${selectedStockClasses.label}`}>
                    স্টক
  </p>
  <p className="text-2xl font-bold text-foreground">
    {formatStockText(selectedProduct)}
  </p>
</div>
                <div className="rounded-xl border border-border bg-muted/50 p-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
                  <p className="text-xs text-muted-foreground font-medium mb-1">
                    স্ট্যাটাস
                  </p>
                  <p className="text-lg font-bold text-foreground">
                    {selectedProduct.isActive ? "✅ সক্রিয়" : "⏸️ বন্ধ"}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-muted/30 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h5 className="text-sm font-semibold text-foreground">
                    রিটার্ন ও এক্সচেঞ্জ সারাংশ
                  </h5>
                  <span className="inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    শেষ রিটার্ন: {formatDateTime(selectedMetrics.lastReturnAt)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-border bg-card px-2.5 py-2.5">
                    <p className="text-[10px] text-muted-foreground">আজ বিক্রি</p>
                    <p className="text-sm font-semibold text-foreground">
                      {formatQty(selectedMetrics.soldQtyToday)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-danger/20 bg-danger-soft/50 px-2.5 py-2.5">
                    <p className="text-[10px] text-danger/80">আজ রিটার্ন</p>
                    <p className="text-sm font-semibold text-danger">
                      {formatQty(selectedMetrics.returnedQtyToday)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-success/20 bg-success-soft/60 px-2.5 py-2.5">
                    <p className="text-[10px] text-success/80">আজ নেট বিক্রি</p>
                    <p className="text-sm font-semibold text-success">
                      {formatQty(selectedMetrics.netQtyToday)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-warning/25 bg-warning-soft/40 px-2.5 py-2.5">
                    <p className="text-[10px] text-warning">রিটার্ন রেট · ৩০ দিন</p>
                    <p className="text-sm font-semibold text-warning">
                      {formatPercent(selectedMetrics.returnRate30d)}%
                    </p>
                  </div>
                </div>

                {!online ? (
                  <p className="text-xs text-muted-foreground">
                    অফলাইনে আছেন। রিটার্ন/এক্সচেঞ্জ history দেখতে অনলাইনে আসুন।
                  </p>
                ) : insightLoadingProductId === selectedProduct.id ? (
                  <p className="text-xs text-muted-foreground">
                    রিটার্ন history লোড হচ্ছে...
                  </p>
                ) : insightError ? (
                  <p className="text-xs text-danger">{insightError}</p>
                ) : selectedInsight && selectedInsight.events.length > 0 ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-border bg-card px-2.5 py-2">
                        <p className="text-[10px] text-muted-foreground">
                          সাম্প্রতিক রিটার্ন
                        </p>
                        <p className="text-sm font-semibold text-danger">
                          {formatQty(selectedInsight.totals.returnedQty)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border bg-card px-2.5 py-2">
                        <p className="text-[10px] text-muted-foreground">
                          সাম্প্রতিক এক্সচেঞ্জ
                        </p>
                        <p className="text-sm font-semibold text-success">
                          {formatQty(selectedInsight.totals.exchangeQty)}
                        </p>
                      </div>
                    </div>
                    <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                      {selectedInsight.events.map((event) => (
                        <div
                          key={event.id}
                          className="rounded-xl border border-border bg-card px-3 py-2.5 shadow-[0_1px_0_rgba(0,0,0,0.02)]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                event.kind === "returned"
                                  ? "border-danger/30 bg-danger-soft text-danger"
                                  : "border-success/30 bg-success-soft text-success"
                              }`}
                            >
                              {event.kind === "returned" ? "রিটার্ন" : "এক্সচেঞ্জ আউট"}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatDateTime(event.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-foreground">
                            {event.returnNo}
                            {event.saleInvoiceNo ? ` · ইনভয়েস ${event.saleInvoiceNo}` : ""}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <span className="inline-flex items-center rounded-full border border-border bg-muted/35 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              পরিমাণ {formatQty(event.quantity)}
                            </span>
                            <span className="inline-flex items-center rounded-full border border-border bg-muted/35 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              লাইন ৳ {formatQty(event.lineTotal)}
                            </span>
                          </div>
                          {event.reason ? (
                            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                              কারণ: {event.reason}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    এই পণ্যে এখনো কোনো রিটার্ন/এক্সচেঞ্জ ইভেন্ট নেই।
                  </p>
                )}
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
                          ? "bg-danger-soft text-danger/60 border border-danger/20 cursor-not-allowed"
                          : "bg-danger-soft text-danger border border-danger/30 hover:bg-danger/15 hover:border-danger/40 active:scale-95"
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

      <Dialog open={templateSetupOpen} onOpenChange={setTemplateSetupOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>টেমপ্লেট সেটআপ করে যোগ করুন</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 font-semibold text-foreground">
                  {templateSetupDrafts.length.toLocaleString("bn-BD")}টি পণ্য
                </span>
                <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 font-semibold text-foreground">
                  {templateSetupDrafts
                    .reduce((sum, draft) => sum + draft.variants.length, 0)
                    .toLocaleString("bn-BD")}
                  টি ভ্যারিয়েন্ট
                </span>
                <span>প্রয়োজনে এখনই ক্রয়মূল্য আর opening stock সেট করুন।</span>
              </div>
            </div>

            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {templateSetupDrafts.map((draft) => (
                <div
                  key={draft.templateId}
                  className="rounded-2xl border border-border bg-card p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-semibold text-foreground">
                          {draft.name}
                        </h4>
                        <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {draft.category || "বিভাগহীন"}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {draft.baseUnit}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {draft.hasVariants
                          ? "ভ্যারিয়েন্টভিত্তিক স্টক/ক্রয়মূল্য দিন"
                          : "এই পণ্যের opening stock আর ক্রয়মূল্য দিন"}
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary">
                      {draft.hasVariants
                        ? `${draft.variants.length.toLocaleString("bn-BD")}টি সাইজ`
                        : "সিম্পল পণ্য"}
                    </span>
                  </div>

                  {!draft.hasVariants ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1">
                        <span className="text-[11px] font-semibold text-muted-foreground">
                          ক্রয়মূল্য
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={draft.buyPrice}
                          onChange={(event) =>
                            updateTemplateSetupDraft(draft.templateId, {
                              buyPrice: event.target.value,
                            })
                          }
                          placeholder="যেমন: 450"
                          className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[11px] font-semibold text-muted-foreground">
                          opening stock
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={draft.openingStock}
                          onChange={(event) =>
                            updateTemplateSetupDraft(draft.templateId, {
                              openingStock: event.target.value,
                            })
                          }
                          placeholder="যেমন: 100"
                          className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm"
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      <div className="hidden rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground md:grid md:grid-cols-[minmax(0,1fr)_110px_120px_100px]">
                        <span>ভ্যারিয়েন্ট</span>
                        <span>বিক্রয়মূল্য</span>
                        <span>ক্রয়মূল্য</span>
                        <span>opening stock</span>
                      </div>
                      {draft.variants.map((variant) => (
                        <div
                          key={`${draft.templateId}:${variant.label}`}
                          className="grid gap-2 rounded-xl border border-border/70 bg-card p-3 md:grid-cols-[minmax(0,1fr)_110px_120px_100px] md:items-center"
                        >
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {variant.label}
                            </p>
                            <p className="text-[11px] text-muted-foreground md:hidden">
                              বিক্রয় ৳{variant.sellPrice || "0"}
                            </p>
                          </div>
                          <div className="hidden text-sm font-medium text-muted-foreground md:block">
                            ৳{variant.sellPrice || "0"}
                          </div>
                          <label className="space-y-1 md:space-y-0">
                            <span className="text-[11px] font-semibold text-muted-foreground md:hidden">
                              ক্রয়মূল্য
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={variant.buyPrice}
                              onChange={(event) =>
                                updateTemplateSetupVariant(draft.templateId, variant.label, {
                                  buyPrice: event.target.value,
                                })
                              }
                              placeholder="ক্রয়"
                              className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm"
                            />
                          </label>
                          <label className="space-y-1 md:space-y-0">
                            <span className="text-[11px] font-semibold text-muted-foreground md:hidden">
                              opening stock
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={variant.openingStock}
                              onChange={(event) =>
                                updateTemplateSetupVariant(draft.templateId, variant.label, {
                                  openingStock: event.target.value,
                                })
                              }
                              placeholder="স্টক"
                              className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm"
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setTemplateSetupOpen(false)}
                className="h-10 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
              >
                পরে করব
              </button>
              <button
                type="button"
                disabled={addingTemplates}
                onClick={() => void handleAddTemplates("plain")}
                className="h-10 rounded-xl border border-warning/30 bg-warning/10 px-4 text-sm font-semibold text-warning hover:bg-warning/15 disabled:opacity-60"
              >
                শুধু পণ্য যোগ করুন
              </button>
              <button
                type="button"
                disabled={addingTemplates}
                onClick={() => void handleAddTemplates("configured")}
                className="h-10 rounded-xl border border-primary/30 bg-primary-soft px-4 text-sm font-semibold text-primary hover:bg-primary/15 disabled:opacity-60"
              >
                {addingTemplates ? "যোগ হচ্ছে..." : "স্টকসহ যোগ করুন"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
              className="h-10 px-4 rounded-xl bg-danger-soft text-danger border border-danger/30 text-sm font-semibold hover:bg-danger/15 hover:border-danger/40 disabled:opacity-60"
            >
              মুছুন
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stock Adjustment Dialog */}
      <Dialog
        open={Boolean(adjusting)}
        onOpenChange={(open) => {
          if (!open) setAdjusting(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>স্টক সমন্বয়</DialogTitle>
            <DialogDescription>
              {adjusting?.productName}
              {adjusting?.variantLabel ? ` · ${adjusting.variantLabel}` : ""}
            </DialogDescription>
          </DialogHeader>
          {adjusting ? (() => {
            const currentQty = parseFloat(adjusting.currentQty) || 0;
            const newQtyNum = parseFloat(adjustNewQty);
            const delta = Number.isFinite(newQtyNum) ? newQtyNum - currentQty : null;
            const unchanged = Number.isFinite(newQtyNum) && newQtyNum === currentQty;
            const canSubmit = !adjustSubmitting && !unchanged && adjustReason && Number.isFinite(newQtyNum) && newQtyNum >= 0;

            return (
              <div className="space-y-4 pt-1">
                <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
                  <span className="text-muted-foreground">বর্তমান স্টক: </span>
                  <span className="font-semibold text-foreground">{adjusting.currentQty}</span>
                </div>

                <label className="block space-y-1.5">
                  <span className="text-sm font-semibold text-foreground">নতুন পরিমাণ</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={adjustNewQty}
                      onChange={(e) => setAdjustNewQty(e.target.value)}
                      className="h-10 flex-1 rounded-xl border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="যেমন: ১৫"
                      autoFocus
                    />
                    {delta !== null && !unchanged && (
                      <span className={`text-sm font-semibold min-w-[3rem] text-right ${
                        delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-danger"
                      }`}>
                        {delta > 0 ? `+${delta.toFixed(2).replace(/\.?0+$/, "")}` : delta.toFixed(2).replace(/\.?0+$/, "")}
                      </span>
                    )}
                  </div>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-sm font-semibold text-foreground">কারণ</span>
                  <select
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">— কারণ বেছে নিন —</option>
                    <option value="DAMAGE">ক্ষতি / নষ্ট</option>
                    <option value="SHRINKAGE">কমতি / মিলছে না</option>
                    <option value="RECOUNT">গণনা সংশোধন</option>
                    <option value="RETURN_TO_SUPPLIER">সরবরাহকারীকে ফেরত</option>
                    <option value="FOUND">অতিরিক্ত পাওয়া গেছে</option>
                    <option value="OTHER">অন্যান্য</option>
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-sm font-semibold text-foreground">
                    নোট <span className="font-normal text-muted-foreground">(ঐচ্ছিক)</span>
                  </span>
                  <textarea
                    rows={2}
                    value={adjustNote}
                    onChange={(e) => setAdjustNote(e.target.value)}
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                    placeholder="যেমন: গুদামে পানি ঢুকেছিল"
                  />
                </label>

                {adjustError ? (
                  <p className="text-sm text-danger">{adjustError}</p>
                ) : null}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setAdjusting(null)}
                    className="flex-1 h-10 rounded-xl border border-border bg-card text-foreground text-sm font-semibold hover:bg-muted transition"
                  >
                    বাতিল
                  </button>
                  <button
                    type="button"
                    disabled={!canSubmit}
                    onClick={async () => {
                      if (!adjusting || !canSubmit) return;
                      setAdjustSubmitting(true);
                      setAdjustError(null);
                      try {
                        await createStockAdjustment({
                          shopId: activeShopId,
                          productId: adjusting.productId,
                          variantId: adjusting.variantId ?? null,
                          newQty: newQtyNum,
                          reason: adjustReason,
                          note: adjustNote || null,
                        });
                        setAdjusting(null);
                      } catch (err) {
                        setAdjustError(err instanceof Error ? err.message : "কিছু একটা সমস্যা হয়েছে");
                      } finally {
                        setAdjustSubmitting(false);
                      }
                    }}
                    className="flex-1 h-10 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    {adjustSubmitting ? "সংরক্ষণ হচ্ছে..." : "সমন্বয় করুন"}
                  </button>
                </div>
              </div>
            );
          })() : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
