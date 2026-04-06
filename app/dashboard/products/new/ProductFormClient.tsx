
// app/dashboard/products/new/ProductFormClient.tsx

"use client";

import {
  useCallback,
  Fragment,
  Suspense,
  type ReactElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { queueAdd } from "@/lib/sync/queue";
import { db, type LocalProduct } from "@/lib/dexie/db";
import {
  createProduct,
  generateProductBarcode,
  suggestProductSku,
} from "@/app/actions/products";
import { useRouter } from "next/navigation";
import { useProductFields } from "@/hooks/useProductFields";
import { type BusinessType, type Field, type BusinessFieldConfig } from "@/lib/productFormConfig";
import { emitProductEvent } from "@/lib/products/product-events";
import BarcodePreviewCard from "@/components/products/BarcodePreviewCard";
import { toast } from "sonner";
import { handlePermissionError } from "@/lib/permission-toast";
import {
  CAMERA_DUPLICATE_WINDOW_MS,
  isRapidDuplicateScan,
  MANUAL_DUPLICATE_WINDOW_MS,
  playScannerFeedbackTone,
  SCAN_IDLE_SUBMIT_MS,
} from "@/lib/scanner/ux";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";
import {
  getSpeechRecognitionCtor,
  mapVoiceErrorBangla,
  startDualLanguageVoice,
  type VoiceSession,
} from "@/lib/voice-recognition";

type Props = {
  shop: { id: string; name: string; businessType?: string | null };
  businessConfig?: BusinessFieldConfig | null;
  canUseBarcodeScan?: boolean;
};

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

type TemplateItem = {
  name: string;
  category?: string;
  unit?: string;
  price?: string;
  count: number;
  lastUsed: number;
};

type VariantDraft = {
  id?: string;
  label: string;
  sellPrice: string;
  sku: string;
  barcode: string;
  sortOrder: number;
  isActive: boolean;
};

const TEMPLATE_LIMIT = 25;

const KEYWORD_CATEGORY_RULES: { keywords: string[]; category: string }[] = [
  { keywords: ["চা", "কফি"], category: "চা/কফি" },
  { keywords: ["ডিম", "চিনি", "তেল", "মসলা", "আটা", "চাল", "আলু"], category: "মুদি" },
  { keywords: ["বিস্কুট", "চিপস", "চকলেট", "নুডলস"], category: "স্ন্যাক্স" },
  { keywords: ["রিচার্জ", "ফ্লেক্সিলোড", "টপ আপ"], category: "রিচার্জ" },
  { keywords: ["ট্যাবলেট", "ক্যাপসুল", "সিরাপ", "প্যারাসিটামল"], category: "ঔষধ" },
  { keywords: ["টি শার্ট", "শার্ট", "প্যান্ট", "ড্রেস"], category: "কাপড়" },
];

const BUSINESS_ASSISTS: Record<
  BusinessType,
  {
    defaultCategory: string;
    fallbackName?: string;
    quickNames: string[];
    categoryChips: string[];
    priceHints: string[];
  }
> = {
  tea_stall: {
    defaultCategory: "চা/কফি",
    quickNames: [],
    categoryChips: ["চা/কফি", "স্ন্যাক্স", "বিস্কুট"],
    priceHints: ["5", "10", "15", "20"],
  },
  pan_cigarette: {
    defaultCategory: "পান/সিগারেট",
    quickNames: [],
    categoryChips: ["পান/সিগারেট", "স্ন্যাক্স", "রিচার্জ"],
    priceHints: ["5", "10", "12", "20"],
  },
  mobile_recharge: {
    defaultCategory: "রিচার্জ",
    quickNames: [],
    categoryChips: ["রিচার্জ", "ডেটা প্যাক"],
    priceHints: ["20", "50", "100", "200"],
    fallbackName: "Mobile Recharge",
  },
  fruits_veg: {
    defaultCategory: "সবজি/ফল",
    quickNames: [],
    categoryChips: ["সবজি/ফল", "পাতাজাতীয়", "মসলা"],
    priceHints: ["40", "60", "80", "120"],
  },
  snacks_stationery: {
    defaultCategory: "স্ন্যাক্স",
    quickNames: [],
    categoryChips: ["স্ন্যাক্স", "স্টেশনারি", "পানীয়"],
    priceHints: ["10", "20", "30", "50"],
  },
  mini_grocery: {
    defaultCategory: "মুদি",
    quickNames: [],
    categoryChips: ["মুদি", "পানীয়", "স্ন্যাক্স"],
    priceHints: ["50", "80", "100", "120"],
  },
  clothing: {
    defaultCategory: "কাপড়",
    quickNames: [],
    categoryChips: ["কাপড়", "এক্সেসরিজ"],
    priceHints: ["150", "250", "350", "500"],
  },
  cosmetics_gift: {
    defaultCategory: "কসমেটিকস",
    quickNames: [],
    categoryChips: ["কসমেটিকস", "গিফট আইটেম", "হেয়ার কেয়ার"],
    priceHints: ["60", "80", "120", "200"],
  },
  pharmacy: {
    defaultCategory: "ঔষধ",
    quickNames: [],
    categoryChips: ["ঔষধ", "বেবি কেয়ার", "হেলথ কেয়ার"],
    priceHints: ["5", "30", "60", "120"],
  },
  mini_wholesale: {
    defaultCategory: "হোলসেল",
    quickNames: [],
    categoryChips: ["হোলসেল", "মুদি", "স্ন্যাক্স"],
    priceHints: ["500", "1000", "1500", "2000"],
  },
};


function parseProductText(input: string) {
  const cleaned = input.replace(/টাকা|tk|taka|price/gi, " ").replace(/:/g, " ");
  const priceMatch = cleaned.match(/(\d+(?:[.,]\d+)?)/);
  if (!priceMatch) {
    return { name: input, price: undefined };
  }
  const price = priceMatch[1].replace(",", "");
  const name = cleaned
    .replace(priceMatch[0], " ")
    .replace(/\s+/g, " ")
    .trim();
  return { name, price: price || undefined };
}

function normalizeCodeInput(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase().slice(0, 80);
}

function createVariantDraft(seed?: Partial<VariantDraft>): VariantDraft {
  return {
    id: seed?.id,
    label: seed?.label ?? "",
    sellPrice: seed?.sellPrice ?? "",
    sku: seed?.sku ?? "",
    barcode: seed?.barcode ?? "",
    sortOrder: seed?.sortOrder ?? 0,
    isActive: seed?.isActive ?? true,
  };
}



function suggestCategoryByName(name: string, businessCategory?: string) {
  const lower = name.toLowerCase();
  for (const rule of KEYWORD_CATEGORY_RULES) {
    if (rule.keywords.some((k) => lower.includes(k.toLowerCase()))) {
      return rule.category;
    }
  }
  return businessCategory;
}

function mergeTemplates(existing: TemplateItem[], incoming: TemplateItem) {
  const idx = existing.findIndex((t) => t.name.toLowerCase() === incoming.name.toLowerCase());
  const next = [...existing];
  if (idx >= 0) {
    const current = next[idx];
    next[idx] = {
      ...current,
      category: incoming.category || current.category,
      unit: incoming.unit || current.unit,
      price: incoming.price || current.price,
      count: current.count + 1,
      lastUsed: incoming.lastUsed,
    };
  } else {
    next.unshift(incoming);
  }
  return next
    .sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed)
    .slice(0, TEMPLATE_LIMIT);
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function scheduleStateUpdate(fn: () => void) {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(fn);
    return;
  }
  Promise.resolve().then(fn);
}

function ProductForm({ shop, businessConfig, canUseBarcodeScan = false }: Props) {
  const router = useRouter();
  const online = useOnlineStatus();
  const businessType = (shop.businessType as BusinessType) || "tea_stall";
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const voiceSessionRef = useRef<VoiceSession | null>(null);
  const scanInputRef = useRef<HTMLInputElement | null>(null);
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
  const cameraContinuousRef = useRef(false);
  const templateStorageKey = useMemo(() => `productTemplates:${shop.id}`, [shop.id]);
  const scannerModeStorageKey = useMemo(
    () => `product-scan-mode:${shop.id}`,
    [shop.id]
  );

  const businessAssist = BUSINESS_ASSISTS[businessType];
  const fallbackName = businessAssist?.fallbackName || "";
  const [name, setName] = useState(fallbackName);
  const [sellPrice, setSellPrice] = useState("");
  const [variantModeEnabled, setVariantModeEnabled] = useState(false);
  const [showVariantCodeFields, setShowVariantCodeFields] = useState(false);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [variantPreviewIndex, setVariantPreviewIndex] = useState<number | null>(null);
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [skuLoading, setSkuLoading] = useState(false);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [variantSkuLoadingIndex, setVariantSkuLoadingIndex] = useState<number | null>(null);
  const [variantBarcodeLoadingIndex, setVariantBarcodeLoadingIndex] = useState<number | null>(
    null
  );
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(false);
  const [scanCode, setScanCode] = useState("");
  const [scanTarget, setScanTarget] = useState<"barcode" | "sku">("barcode");
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
  const [scannerAssistEnabled, setScannerAssistEnabled] = useState(true);
  const [listening, setListening] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  const autoGenerateSku = useCallback(
    async (force = false) => {
      const trimmedName = name.trim();
      if (!trimmedName) return;
      if (!force && skuManuallyEdited) return;

      try {
        setSkuLoading(true);
        const result = await suggestProductSku(shop.id, trimmedName);
        if (result?.sku) {
          setSku(result.sku);
        }
      } catch {
        // SKU suggestion failure should not block product form usage.
      } finally {
        setSkuLoading(false);
      }
    },
    [name, shop.id, skuManuallyEdited]
  );

  const autoGenerateBarcode = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    try {
      setBarcodeLoading(true);
      const result = await generateProductBarcode(shop.id, trimmedName);
      if (result?.barcode) {
        setBarcode(result.barcode);
      }
    } catch {
      // Barcode generation failure should not block product form usage.
    } finally {
      setBarcodeLoading(false);
    }
  }, [name, shop.id]);

  const templateCategories = useMemo(
    () => dedupe(templates.map((t) => t.category).filter(Boolean) as string[]),
    [templates]
  );

  const businessCategories = useMemo(
    () =>
      dedupe(
        [businessAssist?.defaultCategory, ...(businessAssist?.categoryChips ?? [])].filter(
          Boolean
        ) as string[]
      ),
    [businessAssist]
  );

  const baseCategories = useMemo(() => {
    const combined = dedupe([...businessCategories, ...templateCategories, "Uncategorized"]);
    return combined.length ? combined : ["Uncategorized"];
  }, [businessCategories, templateCategories]);
  const baseCategoryKey = useMemo(() => baseCategories.join("|"), [baseCategories]);

  const {
    isFieldVisible,
    isFieldRequired,
    stock,
    unitOptions: configUnits,
    defaultUnit: configDefaultUnit,
    suggestUnit,
  } = useProductFields(businessType, businessConfig);
  const configUnitsKey = useMemo(() => configUnits.join("|"), [configUnits]);

  const unitLabels = useMemo(
    () => ({
      pcs: "পিস",
      packet: "প্যাকেট",
      box: "বক্স",
      dozen: "ডজন",
      kg: "কেজি",
      gm: "গ্রাম",
      liter: "লিটার",
      ml: "মিলি",
      ft: "ফুট",
      strip: "স্ট্রিপ",
      carton: "কার্টন",
    }),
    []
  );

  const [categoryOptions, setCategoryOptions] = useState<string[]>(baseCategories);
  const [selectedCategory, setSelectedCategory] = useState(
    (businessAssist?.defaultCategory && baseCategories.includes(businessAssist.defaultCategory)
      ? businessAssist.defaultCategory
      : baseCategories[0]) || "Uncategorized"
  );
  const [unitOptions, setUnitOptions] = useState<string[]>(configUnits);
  const [selectedUnit, setSelectedUnit] = useState(configDefaultUnit || configUnits[0] || "pcs");
  const [stockEnabled, setStockEnabled] = useState(stock.enabledByDefault);

  const ensuredShopId = shop.id;
  const advancedFieldRenderers: Partial<Record<Field, () => ReactElement>> = {
    buyPrice: () => (
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-foreground">ক্রয়মূল্য (ঐচ্ছিক)</label>
        <input
          name="buyPrice"
          type="number"
          step="0.01"
          min="0"
          required={isFieldRequired("buyPrice")}
          className="w-full h-11 border border-border rounded-xl px-4 text-base bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="যেমন: ৫৫.০০"
        />
        <p className="text-xs text-muted-foreground">চাইলে লাভ হিসাবের জন্য ক্রয়মূল্য দিন</p>
      </div>
    ),
    expiry: () => (
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-foreground">মেয়াদোত্তীর্ণের তারিখ</label>
        <input
          name="expiryDate"
          type="date"
          required={isFieldRequired("expiry")}
          className="w-full h-11 border border-border rounded-xl px-4 text-base bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
    ),
    size: () => (
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-foreground">সাইজ / ভ্যারিয়েন্ট</label>
        <input
          name="size"
          type="text"
          required={isFieldRequired("size")}
          className="w-full h-11 border border-border rounded-xl px-4 text-base bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="যেমন: L, XL, 100ml"
        />
      </div>
    ),
  };
  const visibleAdvancedFields = (["buyPrice", "expiry", "size"] as Field[]).filter((field) =>
    isFieldVisible(field)
  );

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

  // Reset stock/unit when business type changes
  useEffect(() => {
    let cancelled = false;
    scheduleStateUpdate(() => {
      if (cancelled) return;
      setStockEnabled((prev) =>
        prev === stock.enabledByDefault ? prev : stock.enabledByDefault
      );

      setUnitOptions((prev) => {
        const sameLength = prev.length === configUnits.length;
        const sameItems =
          sameLength && prev.every((item, idx) => item === configUnits[idx]);
        return sameItems ? prev : configUnits;
      });

      setSelectedUnit((prev) => {
        const nextUnit = configDefaultUnit || configUnits[0] || "pcs";
        return prev === nextUnit ? prev : nextUnit;
      });
      if (fallbackName) {
        setName((prev) => (prev ? prev : fallbackName));
      }
      const assistCategory = businessAssist?.defaultCategory;
      const nextCategory =
        assistCategory && baseCategories.includes(assistCategory)
          ? assistCategory
          : baseCategories[0] || "Uncategorized";
      setSelectedCategory((prev) => (prev === nextCategory ? prev : nextCategory));
    });
    return () => {
      cancelled = true;
    };
  }, [
    businessType,
    configUnitsKey,
    configUnits,
    configDefaultUnit,
    stock.enabledByDefault,
    businessAssist,
    baseCategoryKey,
    fallbackName,
    baseCategories,
  ]);

  // Voice availability
  useEffect(() => {
    const SpeechRecognitionImpl = getSpeechRecognitionCtor();
    let cancelled = false;
    scheduleStateUpdate(() => {
      if (cancelled) return;
      setVoiceReady(Boolean(SpeechRecognitionImpl));
    });

    return () => {
      cancelled = true;
      voiceSessionRef.current?.stop();
      voiceSessionRef.current = null;
      recognitionRef.current?.stop?.();
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  useEffect(() => {
    try {
      const stored = safeLocalStorageGet(scannerModeStorageKey);
      if (stored === "0") {
        setScannerAssistEnabled(false);
      }
    } catch {
      // ignore local preference read errors
    }
  }, [scannerModeStorageKey]);

  useEffect(() => {
    try {
      safeLocalStorageSet(
        scannerModeStorageKey,
        scannerAssistEnabled ? "1" : "0"
      );
    } catch {
      // ignore local preference write errors
    }
  }, [scannerAssistEnabled, scannerModeStorageKey]);

  useEffect(() => {
    return () => {
      if (scanIdleTimerRef.current) {
        clearTimeout(scanIdleTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (scannerAssistEnabled) return;
    if (scanIdleTimerRef.current) {
      clearTimeout(scanIdleTimerRef.current);
      scanIdleTimerRef.current = null;
    }
    setScanCode("");
    setScanFeedback(null);
    if (cameraOpen) {
      setCameraOpen(false);
    }
    stopCamera();
  }, [cameraOpen, scannerAssistEnabled, stopCamera]);

  useEffect(() => {
    cameraContinuousRef.current = cameraContinuousMode;
  }, [cameraContinuousMode]);

  useEffect(() => {
    if (!cameraOpen) {
      stopCamera();
    }
  }, [cameraOpen, stopCamera]);
  useEffect(() => {
    let cancelled = false;
    scheduleStateUpdate(() => {
      if (cancelled) return;
      setIsMounted(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!scanFeedback) return;
    const id = setTimeout(() => setScanFeedback(null), 2200);
    return () => clearTimeout(id);
  }, [scanFeedback]);

  useEffect(() => {
    if (!cameraOpen || typeof document === "undefined") return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [cameraOpen]);

  // Load recent/frequent templates
  useEffect(() => {
    if (!templateStorageKey) return;
    let cancelled = false;
    const stored = safeLocalStorageGet(templateStorageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as TemplateItem[];
        scheduleStateUpdate(() => {
          if (cancelled) return;
          setTemplates(parsed);
        });
      } catch {
        scheduleStateUpdate(() => {
          if (cancelled) return;
          setTemplates([]);
        });
      }
    }
    return () => {
      cancelled = true;
    };
  }, [templateStorageKey]);

  useEffect(() => {
    if (!ensuredShopId) return;
    let cancelled = false;
    try {
      const stored = safeLocalStorageGet(`customCategories:${ensuredShopId}`);
      const parsed = stored ? (JSON.parse(stored) as string[]) : [];
      const custom = Array.isArray(parsed) ? parsed : [];
      const merged = Array.from(new Set([...baseCategories, ...custom]));
      scheduleStateUpdate(() => {
        if (cancelled) return;
        setCategoryOptions(merged);
        setSelectedCategory((prev) =>
          merged.includes(prev)
            ? prev
            : businessAssist?.defaultCategory && merged.includes(businessAssist.defaultCategory)
            ? businessAssist.defaultCategory
            : merged[0] || "Uncategorized"
        );
      });
    } catch (err) {
      handlePermissionError(err);
      console.error("Failed to load custom categories", err);
      scheduleStateUpdate(() => {
        if (cancelled) return;
        setCategoryOptions(baseCategories);
        setSelectedCategory(
          (businessAssist?.defaultCategory &&
            baseCategories.includes(businessAssist.defaultCategory) &&
            businessAssist.defaultCategory) ||
            baseCategories[0] ||
            "Uncategorized"
        );
      });
    }
    return () => {
      cancelled = true;
    };
  }, [ensuredShopId, baseCategories, businessAssist]);

  useEffect(() => {
    if (!ensuredShopId) return;
    let cancelled = false;
    try {
      const stored = safeLocalStorageGet(`customUnits:${ensuredShopId}`);
      const parsed = stored ? (JSON.parse(stored) as string[]) : [];
      const custom = Array.isArray(parsed) ? parsed : [];
      const merged = Array.from(new Set([...configUnits, ...custom]));

      scheduleStateUpdate(() => {
        if (cancelled) return;
        setUnitOptions((prev) => {
          const sameLength = prev.length === merged.length;
          const sameItems = sameLength && prev.every((v, idx) => v === merged[idx]);
          return sameItems ? prev : merged;
        });

        setSelectedUnit((prev) => {
          const next = configDefaultUnit || merged[0] || "pcs";
          return merged.includes(prev) ? prev : next;
        });
      });
    } catch (err) {
      handlePermissionError(err);
      console.error("Failed to load custom units", err);
      scheduleStateUpdate(() => {
        if (cancelled) return;
        setUnitOptions((prev) => (prev.length ? prev : configUnits));
        setSelectedUnit((prev) => (prev ? prev : configDefaultUnit || configUnits[0] || "pcs"));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [ensuredShopId, configUnitsKey, configDefaultUnit, configUnits]);

  function handleAddCustomCategory() {
    const input = prompt("নতুন ক্যাটাগরি যোগ করুন");
    if (!input) return;
    const value = input.toString().trim();
    if (!value) return;

    const merged = Array.from(new Set([...categoryOptions, value]));
    setCategoryOptions(merged);
    setSelectedCategory(value);

    const customOnly = merged.filter((c) => !baseCategories.includes(c));
    safeLocalStorageSet(
      `customCategories:${ensuredShopId}`,
      JSON.stringify(customOnly)
    );
  }

  function handleAddCustomUnit() {
    const input = prompt("নতুন ইউনিট লিখুন");
    if (!input) return;
    const value = input.toString().trim().toLowerCase();
    if (!value) return;

    const merged = Array.from(new Set([...unitOptions, value]));
    setUnitOptions(merged);
    setSelectedUnit(value);

    const customOnly = merged.filter((u) => !configUnits.includes(u));
    safeLocalStorageSet(
      `customUnits:${ensuredShopId}`,
      JSON.stringify(customOnly)
    );
  }

  function persistTemplates(updater: (prev: TemplateItem[]) => TemplateItem[]) {
    setTemplates((prev) => {
      const next = updater(prev);
      safeLocalStorageSet(templateStorageKey, JSON.stringify(next));
      return next;
    });
  }

  function upsertTemplateFromForm(payload: {
    name: string;
    category?: string;
    unit?: string;
    price?: string;
  }) {
    if (!payload.name) return;
    const incoming: TemplateItem = {
      name: payload.name,
      category: payload.category,
      unit: payload.unit,
      price: payload.price,
      count: 1,
      lastUsed: Date.now(),
    };
    persistTemplates((prev) => mergeTemplates(prev, incoming));
  }

  function setNameWithSmartDefaults(raw: string) {
    const parsed = parseProductText(raw);
    const finalName = parsed.name || raw;
    const nameForInference = finalName.replace(/\s+/g, " ").trim();

    if (isFieldVisible("name")) {
      setName(finalName);
    } else if (!name) {
      setName(fallbackName || finalName);
    }

    if (parsed.price) {
      setSellPrice(parsed.price);
    }

    if (isFieldVisible("unit")) {
      const suggested = suggestUnit(nameForInference, unitOptions);
      if (suggested) {
        setUnitOptions((prev) => (prev.includes(suggested) ? prev : [...prev, suggested]));
        setSelectedUnit(suggested);
      }
    }

    const byCategory = suggestCategoryByName(nameForInference, businessAssist?.defaultCategory);
    if (byCategory) {
      setCategoryOptions((prev) => (prev.includes(byCategory) ? prev : [...prev, byCategory]));
      setSelectedCategory(byCategory);
    }
  }

  function upsertVariant(index: number, patch: Partial<VariantDraft>) {
    setVariants((prev) =>
      prev.map((variant, current) =>
        current === index ? { ...variant, ...patch } : variant
      )
    );
  }

  function addVariant(seed?: Partial<VariantDraft>) {
    setVariants((prev) => {
      const next = [
        ...prev,
        createVariantDraft({
          ...seed,
          sortOrder: prev.length,
          sellPrice: seed?.sellPrice ?? sellPrice,
        }),
      ];
      if (variantPreviewIndex === null) {
        setVariantPreviewIndex(next.length - 1);
      }
      return next;
    });
  }

  function removeVariant(index: number) {
    setVariants((prev) =>
      prev
        .filter((_, current) => current !== index)
        .map((variant, current) => ({ ...variant, sortOrder: current }))
    );
  }

  function addPresetVariants(type: "size" | "volume") {
    const presetLabels =
      type === "size" ? ["Small", "Medium", "Large"] : ["250ml", "500ml", "1L"];
    setVariants((prev) => {
      const existing = new Set(
        prev.map((variant) => variant.label.trim().toLowerCase())
      );
      const added = presetLabels
        .filter((label) => !existing.has(label.toLowerCase()))
        .map((label, idx) =>
          createVariantDraft({
            label,
            sellPrice,
            sortOrder: prev.length + idx,
          })
        );
      return [...prev, ...added];
    });
    setVariantModeEnabled(true);
  }

  function collectReservedVariantCodes(
    excludeIndex: number,
    field: "sku" | "barcode"
  ): Set<string> {
    const reserved = new Set<string>();
    const mainCode = normalizeCodeInput(field === "sku" ? sku : barcode);
    if (mainCode) {
      reserved.add(mainCode);
    }

    variants.forEach((variant, current) => {
      if (current === excludeIndex) return;
      const value = normalizeCodeInput(field === "sku" ? variant.sku : variant.barcode);
      if (value) {
        reserved.add(value);
      }
    });

    return reserved;
  }

  function resolveUniqueVariantCode(baseCode: string, reserved: Set<string>) {
    const normalized = normalizeCodeInput(baseCode);
    if (!normalized) return "";
    if (!reserved.has(normalized)) return normalized;

    const match = normalized.match(/^(.*)-(\d+)$/);
    const stem = match ? match[1] : normalized;
    const width = match ? Math.max(match[2].length, 2) : 3;
    let sequence = match ? Number(match[2]) + 1 : 2;

    while (sequence <= 9999) {
      const candidate = `${stem}-${String(sequence).padStart(width, "0")}`;
      if (!reserved.has(candidate)) {
        return candidate;
      }
      sequence += 1;
    }

    return `${stem}-${Date.now().toString().slice(-6)}`;
  }

  async function autoGenerateVariantSku(index: number) {
    const target = variants[index];
    if (!target) return;
    const seed = (target.label || name).trim();
    if (!seed) return;

    try {
      setVariantSkuLoadingIndex(index);
      const result = await suggestProductSku(shop.id, seed);
      const suggested = normalizeCodeInput(result?.sku ?? "");
      if (!suggested) return;
      const reserved = collectReservedVariantCodes(index, "sku");
      const resolved = resolveUniqueVariantCode(suggested, reserved);
      upsertVariant(index, { sku: resolved });
    } catch {
      // Variant SKU suggestion failure should not block product form usage.
    } finally {
      setVariantSkuLoadingIndex((current) => (current === index ? null : current));
    }
  }

  async function autoGenerateVariantBarcode(index: number) {
    const target = variants[index];
    if (!target) return;
    const seed = (target.label || name).trim();
    if (!seed) return;

    try {
      setVariantBarcodeLoadingIndex(index);
      const result = await generateProductBarcode(shop.id, seed);
      const suggested = normalizeCodeInput(result?.barcode ?? "");
      if (!suggested) return;
      const reserved = collectReservedVariantCodes(index, "barcode");
      const resolved = resolveUniqueVariantCode(suggested, reserved);
      upsertVariant(index, { barcode: resolved });
    } catch {
      // Variant barcode generation failure should not block product form usage.
    } finally {
      setVariantBarcodeLoadingIndex((current) => (current === index ? null : current));
    }
  }

  const resolvedVariantPreviewIndex =
    variantPreviewIndex !== null && variantPreviewIndex >= 0 && variantPreviewIndex < variants.length
      ? variantPreviewIndex
      : variants.length > 0
      ? 0
      : null;

  const activeVariantPreview =
    resolvedVariantPreviewIndex !== null ? variants[resolvedVariantPreviewIndex] : null;

  useEffect(() => {
    if (variants.length === 0) {
      if (variantPreviewIndex !== null) {
        setVariantPreviewIndex(null);
      }
      return;
    }
    if (variantPreviewIndex === null) return;
    if (variantPreviewIndex >= variants.length) {
      setVariantPreviewIndex(variants.length - 1);
    }
  }, [variantPreviewIndex, variants.length]);

  useEffect(() => {
    if (!showVariantCodeFields || variants.length === 0) return;
    if (variantPreviewIndex === null) {
      setVariantPreviewIndex(0);
    }
  }, [showVariantCodeFields, variantPreviewIndex, variants.length]);

  useEffect(() => {
    if (!name.trim()) return;
    if (skuManuallyEdited) return;

    const timer = setTimeout(() => {
      void autoGenerateSku(false);
    }, 260);

    return () => clearTimeout(timer);
  }, [autoGenerateSku, name, skuManuallyEdited]);

  function handleVoiceResult(spoken: string) {
    const parsed = parseProductText(spoken);
    const finalName = parsed.name || spoken;
    setNameWithSmartDefaults(finalName);
    if (parsed.price) {
      setSellPrice(parsed.price);
    }
  }

  function startVoice() {
    if (listening) return;
    voiceSessionRef.current?.stop();
    voiceSessionRef.current = startDualLanguageVoice({
      onRecognitionRef: (recognition) => {
        recognitionRef.current = recognition;
      },
      onTranscript: (spoken) => {
        handleVoiceResult(spoken);
      },
      onError: (kind) => {
        if (kind === "aborted") return;
        if (kind === "not_supported") setVoiceReady(false);
        setVoiceError(mapVoiceErrorBangla(kind));
      },
      onEnd: () => {
        setListening(false);
        voiceSessionRef.current = null;
      },
    });
    if (!voiceSessionRef.current) return;
    setVoiceError(null);
    setListening(true);
  }

  function stopVoice() {
    voiceSessionRef.current?.stop();
    voiceSessionRef.current = null;
    recognitionRef.current?.stop?.();
    setListening(false);
  }

  const frequentTemplates = useMemo(
    () => templates.slice().sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed),
    [templates]
  );

  const recentTemplates = useMemo(
    () => templates.slice().sort((a, b) => b.lastUsed - a.lastUsed),
    [templates]
  );

  const smartNameSuggestions = useMemo(() => {
    const topTemplates = frequentTemplates.slice(0, 6).map((t) => t.name);
    const latest = recentTemplates.slice(0, 6).map((t) => t.name);
    return dedupe([...topTemplates, ...latest]).slice(0, 8);
  }, [frequentTemplates, recentTemplates]);

  const priceSuggestions = useMemo(() => {
    const templatePrices = dedupe(
      recentTemplates
        .map((t) => t.price)
        .filter(Boolean)
        .map((p) => p as string)
    );
    const hints = businessAssist?.priceHints ?? [];
    return dedupe([...templatePrices, ...hints]).slice(0, 6);
  }, [recentTemplates, businessAssist]);

  function applyTemplate(item: TemplateItem) {
    setNameWithSmartDefaults(item.name);
    if (item.price) setSellPrice(item.price);
    if (item.unit && isFieldVisible("unit")) {
      setUnitOptions((prev) => (prev.includes(item.unit!) ? prev : [...prev, item.unit!]));
      setSelectedUnit(item.unit);
    }
    if (item.category) {
      setCategoryOptions((prev) => (prev.includes(item.category!) ? prev : [...prev, item.category!]));
      setSelectedCategory(item.category);
    }
  }

  const focusScanInput = useCallback(() => {
    const input = scanInputRef.current;
    if (!input || cameraOpen) return;
    input.focus();
    input.select();
  }, [cameraOpen]);

  const assignScannedCode = useCallback(
    (rawCode: string, source: "manual" | "camera" = "manual") => {
      if (!scannerAssistEnabled) return false;
      const normalizedCode = normalizeCodeInput(rawCode);
      if (!normalizedCode) {
        setScanFeedback({
          type: "error",
          message: "স্ক্যান কোড খালি আছে, আবার স্ক্যান করুন।",
        });
        playScannerFeedbackTone("error");
        return false;
      }

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
          message: `একই কোড ${normalizedCode} খুব দ্রুত দুইবার এসেছে, duplicate ignore করা হয়েছে।`,
        });
        playScannerFeedbackTone("error");
        return false;
      }

      if (scanTarget === "barcode") {
        setBarcode(normalizedCode);
      } else {
        setSku(normalizedCode);
      }

      lastProcessedScanRef.current = { code: normalizedCode, at: Date.now() };
      setScanFeedback({
        type: "success",
        message:
          scanTarget === "barcode"
            ? source === "camera"
              ? "ক্যামেরা স্ক্যান থেকে Barcode বসানো হয়েছে।"
              : "Barcode ফিল্ডে কোড বসানো হয়েছে।"
            : source === "camera"
            ? "ক্যামেরা স্ক্যান থেকে SKU বসানো হয়েছে।"
            : "SKU ফিল্ডে কোড বসানো হয়েছে।",
      });
      playScannerFeedbackTone("success");
      return true;
    },
    [scanTarget, scannerAssistEnabled]
  );

  function handleScanAssign() {
    if (!scannerAssistEnabled) return;
    if (scanIdleTimerRef.current) {
      clearTimeout(scanIdleTimerRef.current);
      scanIdleTimerRef.current = null;
    }
    const ok = assignScannedCode(scanCode, "manual");
    if (!ok) return;
    setScanCode("");
    focusScanInput();
  }

  useEffect(() => {
    if (!canUseBarcodeScan || !scannerAssistEnabled || cameraOpen || !scanCode) return;
    if (document.activeElement !== scanInputRef.current) return;
    const normalizedCode = normalizeCodeInput(scanCode);
    if (normalizedCode.length < 4) return;

    if (scanIdleTimerRef.current) {
      clearTimeout(scanIdleTimerRef.current);
    }

    scanIdleTimerRef.current = setTimeout(() => {
      if (document.activeElement !== scanInputRef.current) return;
      const ok = assignScannedCode(normalizedCode, "manual");
      if (!ok) return;
      setScanCode("");
      focusScanInput();
    }, SCAN_IDLE_SUBMIT_MS);

    return () => {
      if (scanIdleTimerRef.current) {
        clearTimeout(scanIdleTimerRef.current);
        scanIdleTimerRef.current = null;
      }
    };
  }, [assignScannedCode, cameraOpen, canUseBarcodeScan, focusScanInput, scanCode, scannerAssistEnabled]);

  const toggleCameraTorch = useCallback(async () => {
    const track = cameraTrackRef.current as
      | (MediaStreamTrack & {
          applyConstraints?: (constraints: MediaTrackConstraints) => Promise<void>;
        })
      | null;
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
                const ok = assignScannedCode(normalized, "camera");
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
  }, [assignScannedCode, scannerAssistEnabled, stopCamera]);

  async function handleSubmit(e: any) {
    e.preventDefault();
    const form = new FormData(e.target);

    const buyPriceRaw = form.get("buyPrice") as string;
    const buyPrice = isFieldVisible("buyPrice")
      ? buyPriceRaw && buyPriceRaw.toString().trim() !== ""
        ? (buyPriceRaw as string)
        : null
      : null;

    const baseUnit = isFieldVisible("unit")
      ? ((form.get("baseUnit") as string) || configDefaultUnit || configUnits[0] || "pcs")
      : undefined;

    const stockQty = stockEnabled ? ((form.get("stockQty") as string) || "0") : "0";

    const expiryDate = isFieldVisible("expiry")
      ? ((form.get("expiryDate") as string) || null)
      : null;

    const size = isFieldVisible("size")
      ? ((form.get("size") as string) || "").toString().trim() || null
      : null;

    const requestedSellPrice = (form.get("sellPrice") as string) || sellPrice;
    const resolvedSku = normalizeCodeInput((form.get("sku") as string) || sku);
    const resolvedBarcode = normalizeCodeInput(
      (form.get("barcode") as string) || barcode
    );
    const resolvedName = isFieldVisible("name")
      ? (form.get("name") as string) || name || fallbackName || "Unnamed product"
      : name || fallbackName || (requestedSellPrice ? `Item ${requestedSellPrice}` : "Unnamed product");
    const resolvedVariants = variantModeEnabled
      ? variants
          .map((variant, index) => ({
            id: variant.id,
            label: variant.label.trim(),
            sellPrice: variant.sellPrice.trim(),
            sku: normalizeCodeInput(variant.sku || ""),
            barcode: normalizeCodeInput(variant.barcode || ""),
            sortOrder: index,
            isActive: variant.isActive !== false,
          }))
          .filter((variant) => variant.label.length > 0 && variant.sellPrice.length > 0)
          .map((variant) => ({
            ...variant,
            sku: variant.sku || null,
            barcode: variant.barcode || null,
          }))
      : [];

    if (variantModeEnabled && resolvedVariants.length === 0) {
      toast.error("ভ্যারিয়েন্ট চালু থাকলে অন্তত ১টি label + price দিন।");
      return;
    }
    const resolvedSellPrice =
      requestedSellPrice || resolvedVariants[0]?.sellPrice || "";
    if (!resolvedSellPrice) {
      toast.error("বিক্রয় মূল্য দিন।");
      return;
    }

    const payload: LocalProduct = {
      id: crypto.randomUUID(),
      shopId: ensuredShopId,
      name: resolvedName,
      category: selectedCategory || "Uncategorized",
      sku: resolvedSku || null,
      barcode: resolvedBarcode || null,
      baseUnit,
      buyPrice,
      sellPrice: resolvedSellPrice,
      stockQty,
      isActive: form.get("isActive") === "on",
      trackStock: stockEnabled,
      businessType,
      expiryDate,
      size,
      variants: resolvedVariants,
      updatedAt: Date.now(),
      syncStatus: "new",
    };

    upsertTemplateFromForm({
      name: payload.name,
      category: payload.category,
      unit: payload.baseUnit,
      price: payload.sellPrice,
    });

    try {
      if (online) {
        const result = await createProduct(payload);
        const createdId = result?.id || payload.id;
        try {
          await db.products.put({
            ...payload,
            id: createdId,
            updatedAt: Date.now(),
            syncStatus: "synced",
          });
        } catch (err) {
          handlePermissionError(err);
          console.warn("Seed local product failed", err);
        }
        emitProductEvent({
          shopId: ensuredShopId,
          at: Date.now(),
          source: "create",
        });
        toast.success("পণ্য তৈরি হয়েছে।");
      } else {
        await db.transaction("rw", db.products, db.queue, async () => {
          await db.products.put(payload);
          await queueAdd("product", "create", payload);
        });
        emitProductEvent({
          shopId: ensuredShopId,
          at: Date.now(),
          source: "local",
        });
        toast.success("অফলাইন: পণ্য কিউ হয়েছে, অনলাইনে গেলে সিঙ্ক হবে।");
      }

      router.push(`/dashboard/products?shopId=${ensuredShopId}`);
    } catch (err) {
      if (handlePermissionError(err)) {
        return;
      }
      const message = err instanceof Error ? err.message : "পণ্য তৈরি ব্যর্থ হয়েছে";
      const normalized = message.toLowerCase();
      if (normalized.includes("access to this shop")) {
        toast.error("এই দোকানে আপনার অনুমতি নেই।");
        return;
      }
      toast.error(message);
    }
  }
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_16px_36px_rgba(15,23,42,0.08)] animate-fade-in">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-card to-card" />
        <div className="pointer-events-none absolute -top-16 right-0 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative space-y-3 p-4">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              পণ্য
            </p>
            <h1 className="text-2xl font-bold text-foreground leading-tight tracking-tight sm:text-3xl">
              নতুন পণ্য যোগ করুন
            </h1>
            <p className="text-sm text-muted-foreground">
              কয়েক ট্যাপেই সব তথ্য ভর্তি করার জন্য স্মার্ট ফর্ম
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
              দোকান:
              <span className="truncate font-semibold text-foreground">
                {shop.name}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex h-7 items-center gap-1 rounded-full bg-card/80 px-3 font-semibold text-foreground border border-border shadow-[0_1px_0_rgba(0,0,0,0.03)]">
              ভয়েস ইনপুট
            </span>
            <span className="inline-flex h-7 items-center gap-1 rounded-full bg-card/80 px-3 font-semibold text-muted-foreground border border-border">
              স্মার্ট সাজেশন
            </span>
            <span
              className={`inline-flex h-7 items-center gap-1 rounded-full px-3 font-semibold border ${
                online
                  ? "bg-success-soft text-success border-success/30"
                  : "bg-danger-soft text-danger border-danger/30"
              }`}
            >
              {online ? "অনলাইন" : "অফলাইন"}
            </span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
          {/* Product Name */}
          {isFieldVisible("name") && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-base font-medium text-foreground">
                  পণ্যের নাম *
                </label>
                <span className="text-xs text-muted-foreground">ভয়েস/সাজেশন</span>
              </div>
              <div className="relative">
                <input
                  name="name"
                  value={name}
                  onChange={(e) => setNameWithSmartDefaults(e.target.value)}
                  className="w-full h-12 border border-border rounded-xl px-4 pr-16 text-base bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="যেমন: চা, ডিম, বিস্কুট..."
                  required={isFieldRequired("name")}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={listening ? stopVoice : startVoice}
                  disabled={!voiceReady}
                  aria-label={listening ? "ভয়েস বন্ধ করুন" : "ভয়েস ইনপুট চালু করুন"}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${
                    listening
                      ? "bg-primary-soft text-primary border-primary/40 animate-pulse"
                      : "bg-primary-soft text-primary border-primary/30 active:scale-95"
                  } ${!voiceReady ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  {listening ? "🔴" : "🎤"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {listening
                  ? "শুনছি... নাম ও দাম বলুন"
                  : voiceReady
                  ? "নাম/দাম বললেই অটো বসবে"
                  : "এই ডিভাইসে ভয়েস সাপোর্ট নেই"}{" "}
                {voiceError ? `(${voiceError})` : ""}
              </p>

              {smartNameSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {smartNameSuggestions.map((title) => (
                    <button
                      key={title}
                      type="button"
                      onClick={() => setNameWithSmartDefaults(title)}
                      className="h-9 px-3 rounded-full border border-primary/30 text-primary bg-primary-soft/80 text-xs font-semibold hover:border-primary/50"
                    >
                      {title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sell Price */}
          <div className="space-y-2">
            <label className="block text-base font-medium text-foreground">
              বিক্রয় মূল্য (৳) *
            </label>
            <input
              name="sellPrice"
              type="number"
              step="0.01"
              min="0"
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              className="w-full h-12 border border-border rounded-xl px-4 text-base bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="যেমন: ১০, ২৫.৫০"
              required={isFieldRequired("sellPrice")}
            />
            {priceSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {priceSuggestions.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSellPrice(p)}
                    className="h-9 px-3 rounded-full border border-primary/30 bg-primary-soft/80 text-primary text-xs font-semibold hover:border-primary/50"
                  >
                    ৳ {p}
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              শুধু দাম বললেও/লিখলেও অটো শনাক্ত হবে
            </p>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  ভ্যারিয়েন্ট (Size/ML/Custom)
                </p>
                <p className="text-xs text-muted-foreground">
                  যেসব পণ্যের একাধিক অপশন/দাম আছে, সেগুলোর জন্য
                </p>
              </div>
              <Switch
                checked={variantModeEnabled}
                onCheckedChange={setVariantModeEnabled}
                aria-label="Variant mode toggle"
              />
            </div>

            {variantModeEnabled ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => addPresetVariants("size")}
                    className="h-8 rounded-full border border-primary/30 bg-primary-soft/80 px-3 text-xs font-semibold text-primary"
                  >
                    + Size preset
                  </button>
                  <button
                    type="button"
                    onClick={() => addPresetVariants("volume")}
                    className="h-8 rounded-full border border-primary/30 bg-primary-soft/80 px-3 text-xs font-semibold text-primary"
                  >
                    + Volume preset
                  </button>
                  <button
                    type="button"
                    onClick={() => addVariant()}
                    className="h-8 rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground"
                  >
                    + Custom option
                  </button>
                  {canUseBarcodeScan ? (
                    <button
                      type="button"
                      onClick={() =>
                        setShowVariantCodeFields((prev) => {
                          const next = !prev;
                          if (next && variants.length > 0 && variantPreviewIndex === null) {
                            setVariantPreviewIndex(0);
                          }
                          return next;
                        })
                      }
                      className="h-8 rounded-full border border-border bg-card px-3 text-xs font-semibold text-muted-foreground"
                    >
                      {showVariantCodeFields ? "SKU/Barcode লুকান" : "SKU/Barcode দেখান"}
                    </button>
                  ) : null}
                </div>

                {variants.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Preset বা custom option দিয়ে ভ্যারিয়েন্ট যোগ করুন।
                  </p>
                ) : (
                  <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
                    {variants.map((variant, index) => (
                      <div
                        key={`${variant.id || "new"}-${index}`}
                        className="rounded-xl border border-border bg-card p-3 shadow-sm space-y-2"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-border bg-muted px-1 text-[11px] font-semibold text-muted-foreground">
                              {index + 1}
                            </span>
                            <input
                              type="text"
                              value={variant.label}
                              onChange={(e) =>
                                upsertVariant(index, { label: e.target.value })
                              }
                              placeholder="Label (যেমন: Small, 500ml)"
                              className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-sm"
                            />
                          </div>
                          <div className="flex items-center gap-2 sm:w-auto">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={variant.sellPrice}
                              onChange={(e) =>
                                upsertVariant(index, { sellPrice: e.target.value })
                              }
                              placeholder="Price"
                              className="h-9 w-full min-w-0 rounded-lg border border-border bg-card px-3 text-sm sm:w-36"
                            />
                            <button
                              type="button"
                              onClick={() => removeVariant(index)}
                              aria-label="ভ্যারিয়েন্ট মুছুন"
                              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-danger/30 bg-danger-soft text-sm font-bold text-danger"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        {canUseBarcodeScan && showVariantCodeFields ? (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={variant.sku}
                                onChange={(e) =>
                                  upsertVariant(index, {
                                    sku: normalizeCodeInput(e.target.value),
                                  })
                                }
                                placeholder="SKU (optional)"
                                className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  void autoGenerateVariantSku(index);
                                }}
                                disabled={
                                  variantSkuLoadingIndex === index ||
                                  (!(variant.label || "").trim() && !name.trim())
                                }
                                className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card px-3 text-[11px] font-semibold text-foreground disabled:opacity-50"
                              >
                                {variantSkuLoadingIndex === index ? "..." : "Auto"}
                              </button>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={variant.barcode}
                                onChange={(e) =>
                                  upsertVariant(index, {
                                    barcode: normalizeCodeInput(e.target.value),
                                  })
                                }
                                onFocus={() => setVariantPreviewIndex(index)}
                                placeholder="Barcode (optional)"
                                className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => setVariantPreviewIndex(index)}
                                className={`inline-flex h-9 shrink-0 items-center justify-center rounded-lg border px-3 text-[11px] font-semibold ${
                                  variantPreviewIndex === index
                                    ? "border-primary/40 bg-primary-soft text-primary"
                                    : "border-border bg-card text-foreground"
                                }`}
                              >
                                Preview
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setVariantPreviewIndex(index);
                                  void autoGenerateVariantBarcode(index);
                                }}
                                disabled={
                                  variantBarcodeLoadingIndex === index ||
                                  (!(variant.label || "").trim() && !name.trim())
                                }
                                className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card px-3 text-[11px] font-semibold text-foreground disabled:opacity-50"
                              >
                                {variantBarcodeLoadingIndex === index ? "..." : "Generate"}
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
                {canUseBarcodeScan && showVariantCodeFields && activeVariantPreview ? (
                  <div className="rounded-xl border border-border/70 bg-card/60 p-2">
                    <BarcodePreviewCard
                      value={activeVariantPreview.barcode}
                      productName={
                        [name.trim(), activeVariantPreview.label.trim()]
                          .filter(Boolean)
                          .join(" - ") || name
                      }
                      sellPrice={activeVariantPreview.sellPrice || sellPrice}
                      generating={variantBarcodeLoadingIndex === resolvedVariantPreviewIndex}
                      onGenerate={() => {
                        if (resolvedVariantPreviewIndex === null) return;
                        void autoGenerateVariantBarcode(resolvedVariantPreviewIndex);
                      }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {canUseBarcodeScan ? (
            <div className="rounded-xl border border-primary/20 bg-primary-soft/40 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-foreground">Scanner Assist</p>
                  <p className="text-[11px] text-muted-foreground">
                    সাময়িকভাবে দরকার না হলে বন্ধ রাখতে পারবেন
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {scannerAssistEnabled ? "চালু" : "বন্ধ"}
                  </span>
                  <Switch
                    checked={scannerAssistEnabled}
                    onCheckedChange={setScannerAssistEnabled}
                    aria-label="Scanner assist toggle"
                  />
                </div>
              </div>
              {scannerAssistEnabled ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">স্ক্যান টার্গেট:</span>
                    <button
                      type="button"
                      onClick={() => setScanTarget("barcode")}
                      className={`h-8 rounded-full border px-3 text-xs font-semibold transition-colors ${
                        scanTarget === "barcode"
                          ? "border-primary/40 bg-primary-soft text-primary"
                          : "border-border bg-card text-foreground"
                      }`}
                    >
                      Barcode
                    </button>
                    <button
                      type="button"
                      onClick={() => setScanTarget("sku")}
                      className={`h-8 rounded-full border px-3 text-xs font-semibold transition-colors ${
                        scanTarget === "sku"
                          ? "border-primary/40 bg-primary-soft text-primary"
                          : "border-border bg-card text-foreground"
                      }`}
                    >
                      SKU
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
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
                        handleScanAssign();
                      }}
                      className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder={
                        scanTarget === "barcode"
                          ? "Scanner দিয়ে Barcode scan করুন"
                          : "Scanner দিয়ে SKU scan করুন"
                      }
                    />
                    <button
                      type="button"
                      onClick={handleScanAssign}
                      className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-primary-soft px-3 text-xs font-semibold text-primary"
                    >
                      Scan বসান
                    </button>
                    <button
                      type="button"
                      onClick={openCameraScanner}
                      className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-card px-3 text-xs font-semibold text-primary"
                    >
                      Camera
                    </button>
                  </div>
                  <p
                    className={`text-xs ${
                      scanFeedback?.type === "error" ? "text-danger" : "text-muted-foreground"
                    }`}
                  >
                    {scanFeedback?.message ||
                      "Enter ছাড়াও scanner idle হলেই code auto বসবে, beep দিয়ে success বোঝাবে।"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Camera mode-এ mobile scan হবে, আর duplicate code খুব দ্রুত repeat হলে ignore হবে।
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Scanner assist বন্ধ আছে। চাইলে পরে আবার চালু করে scan/card workflow ব্যবহার করতে পারবেন।
                </p>
              )}
            </div>
          ) : null}

          {canUseBarcodeScan ? (
            <details className="rounded-xl border border-border/70 bg-card/60 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">
                SKU / Barcode (ঐচ্ছিক)
              </summary>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-foreground">
                    SKU (ঐচ্ছিক)
                  </label>
                  <input
                    name="sku"
                    type="text"
                    value={sku}
                    onChange={(e) => {
                      setSku(normalizeCodeInput(e.target.value));
                      setSkuManuallyEdited(true);
                    }}
                    className="w-full h-11 border border-border rounded-xl px-4 text-base bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="যেমন: VEG-001"
                    maxLength={80}
                    autoComplete="off"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      {skuLoading
                        ? "SKU suggest করা হচ্ছে..."
                        : skuManuallyEdited
                        ? "Manual SKU চালু আছে, চাইলে আবার auto-generate করতে পারেন।"
                        : "নাম অনুযায়ী auto-suggest হবে, চাইলে edit করতে পারবেন।"}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSkuManuallyEdited(false);
                        void autoGenerateSku(true);
                      }}
                      disabled={!name.trim() || skuLoading}
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-border px-3 text-xs font-semibold text-foreground transition hover:bg-muted disabled:opacity-50"
                    >
                      Auto SKU
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-foreground">
                    Barcode (ঐচ্ছিক)
                  </label>
                  <input
                    name="barcode"
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(normalizeCodeInput(e.target.value))}
                    className="w-full h-11 border border-border rounded-xl px-4 text-base bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="যেমন: 8901234567890"
                    maxLength={80}
                    autoComplete="off"
                  />
                  <BarcodePreviewCard
                    value={barcode}
                    productName={name}
                    sellPrice={sellPrice}
                    generating={barcodeLoading}
                    onGenerate={() => {
                      void autoGenerateBarcode();
                    }}
                  />
                </div>
              </div>
            </details>
          ) : null}
        </div>

        {/* Category (optional with custom) */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
          <div className="space-y-2">
            <label className="block text-base font-medium text-foreground">
              ক্যাটাগরি (ঐচ্ছিক)
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {isMounted ? (
                <div className="w-full">
                  <input type="hidden" name="category" value={selectedCategory} />
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="h-11 w-full rounded-xl border border-border bg-card px-4 text-left text-base text-foreground shadow-sm focus:ring-2 focus:ring-primary/30">
                      <SelectValue placeholder="ক্যাটাগরি বাছাই করুন" />
                    </SelectTrigger>
                    <SelectContent
                      align="start"
                      className="min-w-[var(--radix-select-trigger-width)]"
                    >
                      {categoryOptions.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <select
                  name="category"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full h-11 border border-border rounded-xl px-4 text-base bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">ক্যাটাগরি বাছাই করুন</option>
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={handleAddCustomCategory}
                className="h-11 px-4 border border-border rounded-xl text-sm font-semibold text-foreground hover:bg-muted transition-colors sm:w-auto"
              >
                + কাস্টম যোগ করুন
              </button>
            </div>
            {businessAssist?.categoryChips?.length ? (
              <div className="flex flex-wrap gap-2">
                {businessAssist.categoryChips.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setCategoryOptions((prev) =>
                        prev.includes(c) ? prev : [...prev, c]
                      );
                      setSelectedCategory(c);
                    }}
                    className="h-9 px-3 rounded-full border border-primary/30 text-primary bg-primary-soft/80 text-xs font-semibold hover:border-primary/50"
                  >
                    {c}
                  </button>
                ))}
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              এক ট্যাপে ক্যাটাগরি/ইউনিট সিলেক্ট করুন; ভয়েস বা নাম লিখলে স্মার্ট ফিল হবে
            </p>
          </div>

          {/* Unit (conditional) */}
          {isFieldVisible("unit") && (
            <div className="space-y-2">
              <label className="block text-base font-medium text-foreground">
                ইউনিট (ঐচ্ছিক)
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                {isMounted ? (
                  <div className="w-full">
                    <input type="hidden" name="baseUnit" value={selectedUnit} />
                    <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                      <SelectTrigger className="h-11 w-full rounded-xl border border-border bg-card px-4 text-left text-base text-foreground shadow-sm focus:ring-2 focus:ring-primary/30">
                        <SelectValue placeholder="ইউনিট বাছাই করুন" />
                      </SelectTrigger>
                      <SelectContent
                        align="start"
                        className="min-w-[var(--radix-select-trigger-width)]"
                      >
                        {unitOptions.map((u) => (
                          <SelectItem key={u} value={u}>
                            {unitLabels[u as keyof typeof unitLabels] || u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <select
                    name="baseUnit"
                    value={selectedUnit}
                    onChange={(e) => setSelectedUnit(e.target.value)}
                    required={isFieldRequired("unit")}
                    className="w-full h-11 border border-border rounded-xl px-4 text-base bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {unitOptions.map((u) => (
                      <option key={u} value={u}>
                        {unitLabels[u as keyof typeof unitLabels] || u}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={handleAddCustomUnit}
                  className="h-11 px-4 border border-border rounded-xl text-sm font-semibold text-foreground hover:bg-muted transition-colors sm:w-auto"
                >
                  + কাস্টম যোগ করুন
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {unitOptions.slice(0, 5).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setSelectedUnit(u)}
                    className="h-9 px-3 rounded-full border border-primary/30 text-primary bg-primary-soft/80 text-xs font-semibold hover:border-primary/50"
                  >
                    {unitLabels[u as keyof typeof unitLabels] || u}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                নাম থেকেই ইউনিট অনুমান হবে: ডিম → পিস, তেল → লিটার, চিনি → কেজি
              </p>
            </div>
          )}

          {/* Stock toggle & qty */}
          <div
            className={`rounded-xl border border-border/70 bg-muted/30 p-3 space-y-3 ${
              stockEnabled ? "" : "blur-[1px]"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={stockEnabled}
                  onChange={(e) => setStockEnabled(e.target.checked)}
                  className="h-5 w-5 border border-border rounded cursor-pointer"
                />
                <span className="text-sm font-semibold text-foreground">
                  স্টক ট্র্যাক
                </span>
              </label>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  stockEnabled
                    ? "bg-success-soft text-success border border-success/30"
                    : "bg-muted text-muted-foreground border border-border"
                }`}
              >
                {stockEnabled ? "চালু" : "বন্ধ"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              দোকানের ধরন দেখে ডিফল্ট অন/অফ সেট হয়; লাগলে বন্ধ করুন
            </p>
            <input
              name="stockQty"
              type="number"
              step="0.01"
              min="0"
              defaultValue="0"
              required={stockEnabled && stock.requiredWhenEnabled}
              disabled={!stockEnabled}
              className="w-full h-11 border border-border rounded-xl px-4 text-base bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-muted disabled:text-muted-foreground"
              placeholder="যেমন: 10, 5.50"
            />
          </div>
        </div>

        {/* Recent templates */}
        {recentTemplates.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">
                রিসেন্ট টেমপ্লেট
              </h3>
              <span className="text-xs text-muted-foreground">এক ট্যাপে অটো-ফিল</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {recentTemplates.slice(0, 4).map((t) => (
                <button
                  key={`${t.name}-${t.lastUsed}`}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="flex items-center justify-between gap-3 bg-card border border-border rounded-xl px-3 py-2 text-left shadow-sm hover:border-primary/40 transition-colors"
                >
                  <div>
                    <p className="font-semibold text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.category || "ক্যাটাগরি নেই"} • {t.unit || "ইউনিট নেই"}
                    </p>
                  </div>
                  {t.price ? (
                    <span className="text-sm font-bold text-primary">৳ {t.price}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick product buttons */}
        {businessAssist?.quickNames?.length ? (
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">এক ট্যাপ পণ্য</h3>
              <span className="text-xs text-muted-foreground">ব্যবসার ধরন অনুযায়ী সাজেশন</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {businessAssist.quickNames.slice(0, 8).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNameWithSmartDefaults(n)}
                  className="h-9 px-3 rounded-full border border-border bg-card text-foreground text-xs font-semibold hover:border-primary/30"
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {/* Advanced (optional) */}
        {visibleAdvancedFields.length > 0 && (
          <details className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-foreground">
              অ্যাডভান্সড অপশন (ঐচ্ছিক)
            </summary>
            <div className="mt-4 space-y-4">
              {visibleAdvancedFields.map((field) => (
                <Fragment key={field}>{advancedFieldRenderers[field]?.()}</Fragment>
              ))}
            </div>
          </details>
        )}

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
          {/* Active Status */}
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked
                className="h-5 w-5 border border-border rounded cursor-pointer"
              />
              <span className="text-sm font-semibold text-foreground">
                পণ্য সক্রিয় রাখুন
              </span>
            </label>
            <p className="text-xs text-muted-foreground">
              অফ-স্টক হলে চাইলে বন্ধ করতে পারেন
            </p>
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              className="flex-1 h-14 sm:h-12 rounded-xl bg-gradient-to-r from-primary to-primary-hover text-primary-foreground border border-primary/40 text-base font-semibold shadow-[0_12px_22px_rgba(22,163,74,0.28)] transition hover:brightness-105 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              + দ্রুত পণ্য যুক্ত করুন
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 h-14 sm:h-12 rounded-xl border border-border text-foreground text-base font-semibold hover:bg-muted transition"
            >
              পিছনে যান
            </button>
          </div>
        </div>
      </form>
      {cameraOpen ? (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm">
          <div className="mx-auto flex h-full w-full max-w-md flex-col px-4 py-4">
            <div className="mb-3 flex items-center justify-between rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-white">
              <div>
                <p className="text-sm font-semibold">ক্যামেরা স্ক্যান</p>
                <p className="text-[11px] text-white/70">
                  বারকোড/কোড ফ্রেমে আনুন, auto detect হবে
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
                  ? "Detected হলে vibration হবে এবং SKU/Barcode auto বসবে।"
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
}

export default function ProductFormClient(props: Props) {
  return (
    <Suspense fallback={<div>Loading form...</div>}>
      <ProductForm {...props} />
    </Suspense>
  );
}
