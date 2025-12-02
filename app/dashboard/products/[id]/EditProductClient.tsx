// app/dashboard/products/[id]/EditProductClient.tsx

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { queueAdd } from "@/lib/sync/queue";
import { db, type LocalProduct } from "@/lib/dexie/db";
import { updateProduct } from "@/app/actions/products";
import { useRouter } from "next/navigation";
import { useProductFields } from "@/hooks/useProductFields";
import { type BusinessType } from "@/lib/productFormConfig";

type Props = { product: any; shop: { id: string; name: string; businessType?: string | null } };

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

const KEYWORD_UNIT_RULES: { keywords: string[]; unit: string }[] = [
  { keywords: ["ডিম", "egg"], unit: "pcs" },
  { keywords: ["তেল", "oil", "দুধ", "পানি", "সিরাপ"], unit: "liter" },
  { keywords: ["চিনি", "চাল", "আটা", "ময়দা", "সুজি", "লবণ", "ডাল"], unit: "kg" },
  { keywords: ["চিপস", "প্যাকেট", "বিস্কুট", "চকলেট"], unit: "packet" },
  { keywords: ["স্ট্রিপ", "ট্যাবলেট", "capsule"], unit: "strip" },
  { keywords: ["কাপড়", "টি শার্ট", "শার্ট", "প্যান্ট"], unit: "pcs" },
];

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
    defaultUnit?: string;
    categoryChips: string[];
    priceHints: string[];
  }
> = {
  tea_stall: {
    defaultCategory: "চা/কফি",
    defaultUnit: "pcs",
    categoryChips: ["চা/কফি", "স্ন্যাক্স", "বিস্কুট"],
    priceHints: ["5", "10", "15", "20"],
  },
  pan_cigarette: {
    defaultCategory: "পান/সিগারেট",
    defaultUnit: "packet",
    categoryChips: ["পান/সিগারেট", "স্ন্যাক্স", "রিচার্জ"],
    priceHints: ["5", "10", "12", "20"],
  },
  mobile_recharge: {
    defaultCategory: "রিচার্জ",
    defaultUnit: "pcs",
    categoryChips: ["রিচার্জ", "ডেটা প্যাক"],
    priceHints: ["20", "50", "100", "200"],
  },
  fruits_veg: {
    defaultCategory: "সবজি/ফল",
    defaultUnit: "kg",
    categoryChips: ["সবজি/ফল", "পাতাজাতীয়", "মসলা"],
    priceHints: ["40", "60", "80", "120"],
  },
  snacks_stationery: {
    defaultCategory: "স্ন্যাক্স",
    defaultUnit: "pcs",
    categoryChips: ["স্ন্যাক্স", "স্টেশনারি", "পানীয়"],
    priceHints: ["10", "20", "30", "50"],
  },
  mini_grocery: {
    defaultCategory: "মুদি",
    defaultUnit: "kg",
    categoryChips: ["মুদি", "পানীয়", "স্ন্যাক্স"],
    priceHints: ["50", "80", "100", "120"],
  },
  clothing: {
    defaultCategory: "কাপড়",
    defaultUnit: "pcs",
    categoryChips: ["কাপড়", "এক্সেসরিজ"],
    priceHints: ["150", "250", "350", "500"],
  },
  cosmetics_gift: {
    defaultCategory: "কসমেটিকস",
    defaultUnit: "pcs",
    categoryChips: ["কসমেটিকস", "গিফট আইটেম", "হেয়ার কেয়ার"],
    priceHints: ["60", "80", "120", "200"],
  },
  pharmacy: {
    defaultCategory: "ঔষধ",
    defaultUnit: "strip",
    categoryChips: ["ঔষধ", "বেবি কেয়ার", "হেলথ কেয়ার"],
    priceHints: ["5", "30", "60", "120"],
  },
  mini_wholesale: {
    defaultCategory: "হোলসেল",
    defaultUnit: "carton",
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

function suggestUnitByName(name: string, availableUnits: string[], businessUnit?: string) {
  const lower = name.toLowerCase();
  for (const rule of KEYWORD_UNIT_RULES) {
    if (rule.keywords.some((k) => lower.includes(k.toLowerCase()))) {
      return availableUnits.includes(rule.unit) ? rule.unit : rule.unit;
    }
  }
  if (businessUnit && availableUnits.includes(businessUnit)) return businessUnit;
  return undefined;
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

export default function EditProductClient({ product, shop }: Props) {
  const router = useRouter();
  const online = useOnlineStatus();
  const businessType = (shop.businessType as BusinessType) || "tea_stall";
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const templateStorageKey = useMemo(() => `productTemplates:${shop.id}`, [shop.id]);
  const shopId = shop.id;

  const [name, setName] = useState(product.name || "");
  const [sellPrice, setSellPrice] = useState((product.sellPrice || "").toString());
  const [listening, setListening] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);

  const businessAssist = BUSINESS_ASSISTS[businessType];

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

  const { isFieldVisible, isFieldRequired, defaultStockOn, unitOptions: configUnits } =
    useProductFields(businessType);

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
    (product.category && baseCategories.includes(product.category)
      ? product.category
      : businessAssist?.defaultCategory && baseCategories.includes(businessAssist.defaultCategory)
      ? businessAssist.defaultCategory
      : baseCategories[0]) || "Uncategorized"
  );
  const [unitOptions, setUnitOptions] = useState<string[]>(configUnits);
  const [selectedUnit, setSelectedUnit] = useState(
    product.baseUnit || businessAssist?.defaultUnit || configUnits[0] || "pcs"
  );
  const [stockEnabled, setStockEnabled] = useState(product.trackStock ?? defaultStockOn);

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

  // Load templates
  useEffect(() => {
    if (!templateStorageKey) return;
    const stored = localStorage.getItem(templateStorageKey);
    if (stored) {
      try {
        setTemplates(JSON.parse(stored) as TemplateItem[]);
      } catch {
        setTemplates([]);
      }
    }
  }, [templateStorageKey]);

  // Load categories
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`customCategories:${shopId}`);
      const parsed = stored ? (JSON.parse(stored) as string[]) : [];
      const custom = Array.isArray(parsed) ? parsed : [];
      const merged = Array.from(new Set([...baseCategories, ...custom, product.category]));
      setCategoryOptions(merged);
      setSelectedCategory((prev: string) =>
        merged.includes(prev)
          ? prev
          : businessAssist?.defaultCategory && merged.includes(businessAssist.defaultCategory)
          ? businessAssist.defaultCategory
          : merged[0] || "Uncategorized"
      );
    } catch (err) {
      console.error("Failed to load custom categories", err);
      setCategoryOptions(baseCategories);
      setSelectedCategory(
        (businessAssist?.defaultCategory && baseCategories.includes(businessAssist.defaultCategory)
          ? businessAssist.defaultCategory
          : baseCategories[0]) || "Uncategorized"
      );
    }
  }, [baseCategories, businessAssist, product.category, shopId]);

  // Load units
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`customUnits:${shopId}`);
      const parsed = stored ? (JSON.parse(stored) as string[]) : [];
      const custom = Array.isArray(parsed) ? parsed : [];
      const merged = Array.from(new Set([...configUnits, ...custom, selectedUnit]));
      setUnitOptions(merged);
      setSelectedUnit((prev: string) => (merged.includes(prev) ? prev : merged[0] || "pcs"));
    } catch (err) {
      console.error("Failed to load custom units", err);
      setUnitOptions(configUnits);
      setSelectedUnit(configUnits[0] || "pcs");
    }
  }, [configUnits, selectedUnit, shopId]);

  // Track stock default
  useEffect(() => {
    setStockEnabled(product.trackStock ?? defaultStockOn);
  }, [product.trackStock, defaultStockOn, businessType]);

  function handleAddCustomCategory() {
    const input = prompt("নতুন ক্যাটাগরি যোগ করুন");
    if (!input) return;
    const value = input.toString().trim();
    if (!value) return;

    const merged = Array.from(new Set([...categoryOptions, value]));
    setCategoryOptions(merged);
    setSelectedCategory(value);

    const customOnly = merged.filter((c) => !baseCategories.includes(c));
    localStorage.setItem(`customCategories:${shopId}`, JSON.stringify(customOnly));
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
    localStorage.setItem(`customUnits:${shopId}`, JSON.stringify(customOnly));
  }

  function setNameWithSmartDefaults(raw: string) {
    const parsed = parseProductText(raw);
    const finalName = parsed.name || raw;

    setName(finalName);

    if (parsed.price) {
      setSellPrice(parsed.price);
    }

    if (isFieldVisible("unit")) {
      const suggested = suggestUnitByName(
        finalName,
        [...unitOptions, businessAssist?.defaultUnit || ""],
        businessAssist?.defaultUnit
      );
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
      ? ((form.get("baseUnit") as string) || configUnits[0] || "pcs")
      : undefined;

    const stockQty = stockEnabled ? ((form.get("stockQty") as string) || "0") : "0";

    const expiryDate = isFieldVisible("expiry")
      ? ((form.get("expiryDate") as string) || null)
      : null;

    const size = isFieldVisible("size")
      ? ((form.get("size") as string) || "").toString().trim() || null
      : null;

    const payload: LocalProduct = {
      ...product,
      shopId: shopId,
      name: (form.get("name") as string) || name,
      category: selectedCategory || "Uncategorized",
      baseUnit,
      buyPrice,
      sellPrice: (form.get("sellPrice") as string) || sellPrice,
      stockQty,
      isActive: form.get("isActive") === "on",
      trackStock: stockEnabled,
      businessType,
      expiryDate,
      size,
      updatedAt: Date.now(),
      syncStatus: "updated",
    };

    const template: TemplateItem = {
      name: payload.name,
      category: payload.category,
      unit: payload.baseUnit,
      price: payload.sellPrice,
      count: 1,
      lastUsed: Date.now(),
    };
    setTemplates((prev) => {
      const merged = mergeTemplates(prev, template);
      localStorage.setItem(templateStorageKey, JSON.stringify(merged));
      return merged;
    });

    if (online) {
      await updateProduct(product.id, payload);
      alert("পণ্য সফলভাবে আপডেট হয়েছে");
    } else {
      await db.products.put(payload);
      await queueAdd("product", "update", payload);
      alert("পণ্য অফলাইনে আপডেট; অনলাইনে হলে সিঙ্ক হবে");
    }

    router.push(`/dashboard/products?shopId=${shopId}`);
  }

  return (
    <div className="max-w-2xl mx-auto">
      
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">পণ্য তথ্য সম্পাদনা</h1>
        <p className="text-gray-600 mt-2">ভয়েস + অটো সাজেশন দিয়ে দ্রুত আপডেট</p>
        <p className="text-sm text-gray-500 mt-1">দোকান: {shop.name}</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-8 space-y-6">
        
        {/* Product Name */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">পণ্যের নাম *</label>
          <div className="flex gap-3">
            <input
              name="name"
              value={name}
              onChange={(e) => setNameWithSmartDefaults(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
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
                  ? "bg-red-50 border-red-300 text-red-700"
                  : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:border-emerald-300"
              } ${!voiceReady ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              {listening ? "থামান" : "ভয়েস"}
            </button>
          </div>
          <p className="text-sm text-gray-500">
            {listening
              ? "শুনছে... বলুন: “ডিম ১০ টাকা”"
              : voiceReady
              ? "মাইক্রোফোনে বললে নাম + দাম অটো ভর্তি"
              : "এই ব্রাউজারে ভয়েস ইনপুট নেই"} {voiceError ? `(${voiceError})` : ""}
          </p>
          {smartNameSuggestions.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {smartNameSuggestions.map((title) => (
                <button
                  key={title}
                  type="button"
                  onClick={() => setNameWithSmartDefaults(title)}
                  className="px-3 py-2 rounded-full border border-emerald-200 text-emerald-800 bg-emerald-50 text-sm hover:border-emerald-300"
                >
                  {title}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sell Price */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">বিক্রয় মূল্য (৳) *</label>
          <input
            name="sellPrice"
            type="number"
            step="0.01"
            min="0"
            value={sellPrice}
            onChange={(e) => setSellPrice(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
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
                  className="px-3 py-2 rounded-full border border-blue-200 bg-blue-50 text-blue-800 text-sm hover:border-blue-300"
                >
                  ৳ {p}
                </button>
              ))}
            </div>
          )}
          <p className="text-sm text-gray-500">নাম বললেই দাম ধরার চেষ্টা করবে</p>
        </div>

        {/* Category */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">ক্যাটাগরি</label>
          <div className="flex gap-3">
            <select
              name="category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
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
              className="shrink-0 px-4 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-900 hover:bg-gray-100 transition-colors"
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
                  className="px-3 py-2 rounded-full border border-emerald-200 text-emerald-700 bg-emerald-50 text-sm hover:border-emerald-300"
                >
                  {c}
                </button>
              ))}
            </div>
          ) : null}
          <p className="text-sm text-gray-500">নাম/ভয়েস থেকে ক্যাটাগরি অনুমান করার চেষ্টা করবে</p>
        </div>

        {/* Unit */}
        {isFieldVisible("unit") && (
          <div className="space-y-2">
            <label className="block text-base font-medium text-gray-900">ইউনিট</label>
            <div className="flex gap-3">
              <select
                name="baseUnit"
                value={selectedUnit}
                onChange={(e) => setSelectedUnit(e.target.value)}
                required={isFieldRequired("unit")}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
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
                className="shrink-0 px-4 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-900 hover:bg-gray-100 transition-colors"
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
                  className="px-3 py-2 rounded-full border border-orange-200 text-orange-700 bg-orange-50 text-sm hover:border-orange-300"
                >
                  {unitLabels[u as keyof typeof unitLabels] || u}
                </button>
              ))}
            </div>
            <p className="text-sm text-gray-500">নাম থেকেই ইউনিট অনুমান হবে: ডিম → পিস, তেল → লিটার</p>
          </div>
        )}

        {/* Stock toggle & qty */}
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input 
              type="checkbox" 
              checked={stockEnabled}
              onChange={(e) => setStockEnabled(e.target.checked)}
              className="w-5 h-5 border border-gray-300 rounded cursor-pointer"
            />
            <span className="text-base font-medium text-gray-900">স্টক ট্র্যাক (অন/অফ)</span>
          </label>
          <div className="pt-2">
            <input
              name="stockQty"
              type="number"
              step="0.01"
              min="0"
              defaultValue={product.stockQty || "0"}
              required={stockEnabled && isFieldRequired("stock")}
              disabled={!stockEnabled}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100 disabled:text-gray-500"
              placeholder="যেমন: 10, 5.50"
            />
          </div>
        </div>

        {/* Advanced */}
        <details className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <summary className="cursor-pointer text-base font-semibold text-gray-900">
            অ্যাডভান্সড অপশন (ঐচ্ছিক)
          </summary>
          <div className="mt-4 space-y-4">
            {isFieldVisible("buyPrice") && (
              <div className="space-y-2">
                <label className="block text-base font-medium text-gray-900">ক্রয়মূল্য (ঐচ্ছিক)</label>
                <input
                  name="buyPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  required={isFieldRequired("buyPrice")}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="যেমন: ৫৫.০০"
                  defaultValue={product.buyPrice || ""}
                />
                <p className="text-sm text-gray-500">চাইলে লাভ হিসাবের জন্য ক্রয়মূল্য দিন</p>
              </div>
            )}

            {isFieldVisible("expiry") && (
              <div className="space-y-2">
                <label className="block text-base font-medium text-gray-900">মেয়াদোত্তীর্ণের তারিখ</label>
                <input
                  name="expiryDate"
                  type="date"
                  required={isFieldRequired("expiry")}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                  defaultValue={product.expiryDate || ""}
                />
              </div>
            )}

            {isFieldVisible("size") && (
              <div className="space-y-2">
                <label className="block text-base font-medium text-gray-900">সাইজ / বৈচিত্র্য</label>
                <input
                  name="size"
                  type="text"
                  required={isFieldRequired("size")}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="যেমন: L, XL, 100ml"
                  defaultValue={product.size || ""}
                />
              </div>
            )}
          </div>
        </details>

        {/* Active Status */}
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input 
              type="checkbox" 
              name="isActive" 
              defaultChecked={product.isActive !== false}
              className="w-5 h-5 border border-gray-300 rounded cursor-pointer"
            />
            <span className="text-base font-medium text-gray-900">পণ্য সক্রিয় রাখুন</span>
          </label>
        </div>

        {/* Recent templates */}
        {recentTemplates.length > 0 && (
          <div className="border border-emerald-100 bg-emerald-50 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-emerald-800">রিসেন্ট টেমপ্লেট</h3>
              <span className="text-xs text-emerald-700">এক ট্যাপে অটো-ফিল</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {recentTemplates.slice(0, 4).map((t) => (
                <button
                  key={`${t.name}-${t.lastUsed}`}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="flex items-center justify-between gap-3 bg-white border border-emerald-100 rounded-lg px-3 py-2 text-left hover:border-emerald-300 transition-colors"
                >
                  <div>
                    <p className="font-semibold text-gray-900">{t.name}</p>
                    <p className="text-xs text-gray-500">
                      {t.category || "ক্যাটাগরি নেই"} • {t.unit || "ইউনিট নেই"}
                    </p>
                  </div>
                  {t.price ? (
                    <span className="text-sm font-bold text-emerald-700">৳ {t.price}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3 pt-4">
          <button 
            type="submit"
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg text-lg transition-colors"
          >
            ✓ পণ্য আপডেট করুন
          </button>
          <button 
            type="button"
            onClick={() => router.back()}
            className="flex-1 border border-gray-300 text-gray-900 font-medium py-4 px-6 rounded-lg text-lg hover:bg-gray-100 transition-colors"
          >
            পিছনে যান
          </button>
        </div>
      </form>
    </div>
  );
}
