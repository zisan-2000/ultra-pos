
// app/dashboard/products/new/ProductFormClient.tsx

"use client";

import {
  Fragment,
  Suspense,
  type ReactElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { queueAdd } from "@/lib/sync/queue";
import { db, type LocalProduct } from "@/lib/dexie/db";
import { createProduct } from "@/app/actions/products";
import { useRouter } from "next/navigation";
import { useProductFields } from "@/hooks/useProductFields";
import { type BusinessType, type Field, type BusinessFieldConfig } from "@/lib/productFormConfig";
import toast from "react-hot-toast";
import { handlePermissionError } from "@/lib/permission-toast";

type Props = {
  shop: { id: string; name: string; businessType?: string | null };
  businessConfig?: BusinessFieldConfig | null;
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

type TemplateItem = {
  name: string;
  category?: string;
  unit?: string;
  price?: string;
  count: number;
  lastUsed: number;
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
  const price = priceMatch ? priceMatch[1].replace(",", "") : null;
  const name = priceMatch
    ? cleaned.replace(priceMatch[0], " ").replace(/\s+/g, " ").trim()
    : cleaned.trim();
  return { name, price: price || undefined };
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
function ProductForm({ shop, businessConfig }: Props) {
  const router = useRouter();
  const online = useOnlineStatus();
  const businessType = (shop.businessType as BusinessType) || "tea_stall";
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const templateStorageKey = useMemo(() => `productTemplates:${shop.id}`, [shop.id]);

  const businessAssist = BUSINESS_ASSISTS[businessType];
  const fallbackName = businessAssist?.fallbackName || "";
  const [name, setName] = useState(fallbackName);
  const [sellPrice, setSellPrice] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);

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
        <label className="block text-base font-medium text-foreground">ক্রয়মূল্য (ঐচ্ছিক)</label>
        <input
          name="buyPrice"
          type="number"
          step="0.01"
          min="0"
          required={isFieldRequired("buyPrice")}
          className="w-full border border-border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="যেমন: ৫৫.০০"
        />
        <p className="text-sm text-muted-foreground">চাইলে লাভ হিসাবের জন্য ক্রয়মূল্য দিন</p>
      </div>
    ),
    expiry: () => (
      <div className="space-y-2">
        <label className="block text-base font-medium text-foreground">মেয়াদোত্তীর্ণের তারিখ</label>
        <input
          name="expiryDate"
          type="date"
          required={isFieldRequired("expiry")}
          className="w-full border border-border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
    ),
    size: () => (
      <div className="space-y-2">
        <label className="block text-base font-medium text-foreground">সাইজ / ভ্যারিয়েন্ট</label>
        <input
          name="size"
          type="text"
          required={isFieldRequired("size")}
          className="w-full border border-border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="যেমন: L, XL, 100ml"
        />
      </div>
    ),
  };
  const visibleAdvancedFields = (["buyPrice", "expiry", "size"] as Field[]).filter((field) =>
    isFieldVisible(field)
  );

  // Reset stock/unit when business type changes
  useEffect(() => {
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
    const SpeechRecognitionImpl =
      typeof window !== "undefined"
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;
    setVoiceReady(Boolean(SpeechRecognitionImpl));

    return () => {
      recognitionRef.current?.stop?.();
    };
  }, []);

  // Load recent/frequent templates
  useEffect(() => {
    if (!templateStorageKey) return;
    const stored = localStorage.getItem(templateStorageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as TemplateItem[];
        setTemplates(parsed);
      } catch {
        setTemplates([]);
      }
    }
  }, [templateStorageKey]);

  useEffect(() => {
    if (!ensuredShopId) return;
    try {
      const stored = localStorage.getItem(`customCategories:${ensuredShopId}`);
      const parsed = stored ? (JSON.parse(stored) as string[]) : [];
      const custom = Array.isArray(parsed) ? parsed : [];
      const merged = Array.from(new Set([...baseCategories, ...custom]));
      setCategoryOptions(merged);
      setSelectedCategory((prev) =>
        merged.includes(prev)
          ? prev
          : businessAssist?.defaultCategory && merged.includes(businessAssist.defaultCategory)
          ? businessAssist.defaultCategory
          : merged[0] || "Uncategorized"
      );
    } catch (err) {
      handlePermissionError(err);
      console.error("Failed to load custom categories", err);
      setCategoryOptions(baseCategories);
      setSelectedCategory(
        (businessAssist?.defaultCategory &&
          baseCategories.includes(businessAssist.defaultCategory) &&
          businessAssist.defaultCategory) ||
          baseCategories[0] ||
          "Uncategorized"
      );
    }
  }, [ensuredShopId, baseCategories, businessAssist]);

  useEffect(() => {
    if (!ensuredShopId) return;
    try {
      const stored = localStorage.getItem(`customUnits:${ensuredShopId}`);
      const parsed = stored ? (JSON.parse(stored) as string[]) : [];
      const custom = Array.isArray(parsed) ? parsed : [];
      const merged = Array.from(new Set([...configUnits, ...custom]));

      setUnitOptions((prev) => {
        const sameLength = prev.length === merged.length;
        const sameItems = sameLength && prev.every((v, idx) => v === merged[idx]);
        return sameItems ? prev : merged;
      });

      setSelectedUnit((prev) => {
        const next = configDefaultUnit || merged[0] || "pcs";
        return merged.includes(prev) ? prev : next;
      });
    } catch (err) {
      handlePermissionError(err);
      console.error("Failed to load custom units", err);
      setUnitOptions((prev) => (prev.length ? prev : configUnits));
      setSelectedUnit((prev) => (prev ? prev : configDefaultUnit || configUnits[0] || "pcs"));
    }
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
    localStorage.setItem(`customCategories:${ensuredShopId}`, JSON.stringify(customOnly));
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
    localStorage.setItem(`customUnits:${ensuredShopId}`, JSON.stringify(customOnly));
  }

  function persistTemplates(updater: (prev: TemplateItem[]) => TemplateItem[]) {
    setTemplates((prev) => {
      const next = updater(prev);
      localStorage.setItem(templateStorageKey, JSON.stringify(next));
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

    if (isFieldVisible("name")) {
      setName(finalName);
    } else if (!name) {
      setName(fallbackName || finalName);
    }

    if (parsed.price) {
      setSellPrice(parsed.price);
    }

    if (isFieldVisible("unit")) {
      const suggested = suggestUnit(finalName, unitOptions);
      if (suggested) {
        setUnitOptions((prev) => (prev.includes(suggested) ? prev : [...prev, suggested]));
        setSelectedUnit(suggested);
      }
    }

    const byCategory = suggestCategoryByName(finalName, businessAssist?.defaultCategory);
    if (byCategory) {
      setCategoryOptions((prev) => (prev.includes(byCategory) ? prev : [...prev, byCategory]));
      setSelectedCategory(byCategory);
    }
  }

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
    const SpeechRecognitionImpl =
      typeof window !== "undefined"
        ? ((window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition)
        : null;

    if (!SpeechRecognitionImpl) {
      setVoiceReady(false);
      setVoiceError("ব্রাউজার মাইক্রোফোন সাপোর্ট দিচ্ছে না");
      return;
    }

    const recognition: SpeechRecognitionInstance = new SpeechRecognitionImpl();
    recognition.lang = "bn-BD";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onerror = () => {
      setListening(false);
      setVoiceError("মাইক্রোফোন অ্যাক্সেস মেলেনি");
    };
    recognition.onend = () => setListening(false);
    recognition.onresult = (event: any) => {
      const spoken: string | undefined = event?.results?.[0]?.[0]?.transcript;
      if (spoken) {
        handleVoiceResult(spoken);
      }
      setListening(false);
    };

    recognitionRef.current = recognition;
    setVoiceError(null);
    setListening(true);
    recognition.start();
  }

  function stopVoice() {
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

    const resolvedSellPrice = (form.get("sellPrice") as string) || sellPrice;
    const resolvedName = isFieldVisible("name")
      ? (form.get("name") as string) || name || fallbackName || "Unnamed product"
      : name || fallbackName || (resolvedSellPrice ? `Item ${resolvedSellPrice}` : "Unnamed product");

    const payload: LocalProduct = {
      id: crypto.randomUUID(),
      shopId: ensuredShopId,
      name: resolvedName,
      category: selectedCategory || "Uncategorized",
      baseUnit,
      buyPrice,
      sellPrice: resolvedSellPrice,
      stockQty,
      isActive: form.get("isActive") === "on",
      trackStock: stockEnabled,
      businessType,
      expiryDate,
      size,
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
        await createProduct(payload);
        toast.success("পণ্য তৈরি হয়েছে।");
      } else {
        await db.products.put(payload);
        await queueAdd("product", "create", payload);
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
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">নতুন পণ্য যোগ করুন</h1>
        <p className="text-muted-foreground mt-2">কয়েক ট্যাপেই সব তথ্য ভর্তি করার জন্য স্মার্ট ফর্ম</p>
        <p className="text-sm text-muted-foreground mt-1">দোকান: {shop.name}</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-card rounded-lg border border-border p-8 space-y-6">
        
        {/* Product Name */}
        {isFieldVisible("name") && (
          <div className="space-y-2">
            <label className="block text-base font-medium text-foreground">পণ্যের নাম *</label>
            <div className="flex gap-3">
              <input
                name="name"
                value={name}
                onChange={(e) => setNameWithSmartDefaults(e.target.value)}
                className="w-full border border-border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="যেমন: চা, ডিম, বিস্কুট..."
                required={isFieldRequired("name")}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={listening ? stopVoice : startVoice}
                disabled={!voiceReady}
                  className={`shrink-0 px-4 py-3 border rounded-lg font-medium transition-colors ${
                    listening
                      ? "bg-primary-soft text-primary border-primary/40"
                      : "bg-primary-soft border-primary/30 text-primary hover:border-primary/50"
                  } ${!voiceReady ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                {listening ? "থামান" : "ভয়েস"}
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              {listening
                ? "Listening... say product name and price"
                : voiceReady
                ? "Say product name and price to fill automatically"
                : "Microphone not ready"}{" "}
              {voiceError ? `(${voiceError})` : ""}
            </p>
            
            {smartNameSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {smartNameSuggestions.map((title) => (
                  <button
                    key={title}
                    type="button"
                    onClick={() => setNameWithSmartDefaults(title)}
                    className="px-3 py-2 rounded-full border border-primary/30 text-primary bg-primary-soft text-sm hover:border-primary/50"
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
          <label className="block text-base font-medium text-foreground">বিক্রয় মূল্য (৳) *</label>
          <input
            name="sellPrice"
            type="number"
            step="0.01"
            min="0"
            value={sellPrice}
            onChange={(e) => setSellPrice(e.target.value)}
            className="w-full border border-border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                  className="px-3 py-2 rounded-full border border-primary/30 bg-primary-soft text-primary text-sm hover:border-primary/50"
                >
                  ৳ {p}
                </button>
              ))}
            </div>
          )}
          <p className="text-sm text-muted-foreground">শুধু দাম বললেও/লিখলেও অটো শনাক্ত হবে</p>
        </div>

        {/* Category (optional with custom) */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-foreground">ক্যাটাগরি (ঐচ্ছিক)</label>
          <div className="flex gap-3">
            <select
              name="category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full border border-border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">ক্যাটাগরি বাছাই করুন</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAddCustomCategory}
              className="shrink-0 px-4 py-3 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
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
                    setCategoryOptions((prev) => (prev.includes(c) ? prev : [...prev, c]));
                    setSelectedCategory(c);
                  }}
                  className="px-3 py-2 rounded-full border border-primary/30 text-primary bg-primary-soft text-sm hover:border-primary/50"
                >
                  {c}
                </button>
              ))}
            </div>
          ) : null}
          <p className="text-sm text-muted-foreground">
            এক ট্যাপে ক্যাটাগরি/ইউনিট সিলেক্ট করুন; ভয়েস বা নাম লিখলে স্মার্ট ফিল হবে
          </p>
        </div>

        {/* Unit (conditional) */}
        {isFieldVisible("unit") && (
          <div className="space-y-2">
            <label className="block text-base font-medium text-foreground">ইউনিট (ঐচ্ছিক)</label>
            <div className="flex gap-3">
              <select
                name="baseUnit"
                value={selectedUnit}
                onChange={(e) => setSelectedUnit(e.target.value)}
                required={isFieldRequired("unit")}
                className="w-full border border-border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {unitOptions.map((u) => (
                  <option key={u} value={u}>
                    {unitLabels[u as keyof typeof unitLabels] || u}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddCustomUnit}
                className="shrink-0 px-4 py-3 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
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
                  className="px-3 py-2 rounded-full border border-primary/30 text-primary bg-primary-soft text-sm hover:border-primary/50"
                >
                  {unitLabels[u as keyof typeof unitLabels] || u}
                </button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              নাম থেকেই ইউনিট অনুমান হবে: ডিম → পিস, তেল → লিটার, চিনি → কেজি
            </p>
          </div>
        )}

        {/* Stock toggle & qty */}
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input 
              type="checkbox" 
              checked={stockEnabled}
              onChange={(e) => setStockEnabled(e.target.checked)}
              className="w-5 h-5 border border-border rounded cursor-pointer"
            />
            <span className="text-base font-medium text-foreground">স্টক ট্র্যাক (অন/অফ)</span>
          </label>
          <p className="text-sm text-muted-foreground">দোকানের ধরন দেখে ডিফল্ট অন/অফ সেট হয়; লাগলে বন্ধ করুন</p>
          <div className="pt-2">
            <input
              name="stockQty"
              type="number"
              step="0.01"
              min="0"
              defaultValue="0"
              required={stockEnabled && stock.requiredWhenEnabled}
              disabled={!stockEnabled}
              className="w-full border border-border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-muted disabled:text-muted-foreground"
              placeholder="যেমন: 10, 5.50"
            />
          </div>
        </div>

        {/* Recent templates */}
        {recentTemplates.length > 0 && (
          <div className="border border-border bg-muted rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">রিসেন্ট টেমপ্লেট</h3>
              <span className="text-xs text-muted-foreground">এক ট্যাপে অটো-ফিল</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {recentTemplates.slice(0, 4).map((t) => (
                <button
                  key={`${t.name}-${t.lastUsed}`}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="flex items-center justify-between gap-3 bg-card border border-border rounded-lg px-3 py-2 text-left hover:border-primary/40 transition-colors"
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
          <div className="border border-border bg-muted rounded-lg p-4 space-y-2">
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
                  className="px-3 py-2 rounded-full border border-border bg-card text-foreground text-sm hover:border-primary/30"
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {/* Advanced (optional) */}
        {visibleAdvancedFields.length > 0 && (
          <details className="border border-border rounded-lg p-4 bg-muted">
            <summary className="cursor-pointer text-base font-semibold text-foreground">
              অ্যাডভান্সড অপশন (ঐচ্ছিক)
            </summary>
            <div className="mt-4 space-y-4">
              {visibleAdvancedFields.map((field) => (
                <Fragment key={field}>{advancedFieldRenderers[field]?.()}</Fragment>
              ))}
            </div>
          </details>
        )}

{/* Active Status */}
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input 
              type="checkbox" 
              name="isActive" 
              defaultChecked
              className="w-5 h-5 border border-border rounded cursor-pointer"
            />
            <span className="text-base font-medium text-foreground">পণ্য সক্রিয় রাখুন</span>
          </label>
          <p className="text-sm text-muted-foreground">অফ-স্টক হলে চাইলে বন্ধ করতে পারেন</p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            className="flex-1 bg-primary-soft text-primary border border-primary/30 hover:bg-primary/15 hover:border-primary/40 font-bold py-4 px-6 rounded-lg text-lg transition-colors"
          >
            + দ্রুত পণ্য যুক্ত করুন
          </button>
          <button 
            type="button"
            onClick={() => router.back()}
            className="flex-1 border border-border text-foreground font-medium py-4 px-6 rounded-lg text-lg hover:bg-muted transition-colors"
          >
            পিছনে যান
          </button>
        </div>
      </form>
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
