export type BusinessProfileKey =
  | "quick_counter"
  | "food_service"
  | "food_cart_quick_service"
  | "retail_inventory"
  | "produce_inventory"
  | "fashion_variant"
  | "pharmacy_inventory"
  | "hardware_advanced"
  | "wholesale_inventory"
  | "digital_recharge"
  | "service_only";

export type FeatureBundleDefaults = {
  inventoryByDefault: boolean;
  cogsByDefault: boolean;
  barcodeByDefault: boolean;
  queueWorkflow?: "restaurant" | "salon" | "generic" | null;
};

export type BusinessAssist = {
  defaultCategory: string;
  fallbackName?: string;
  quickNames?: string[];
  categoryChips: string[];
  priceHints: string[];
};

export type BusinessTypeSpec = {
  key: string;
  label: string;
  canonicalKey: string;
  profile: BusinessProfileKey;
  selectable: boolean;
  templateCandidates: string[];
  featureDefaults: FeatureBundleDefaults;
  assist: BusinessAssist;
};

const PROFILE_FEATURE_DEFAULTS: Record<BusinessProfileKey, FeatureBundleDefaults> = {
  quick_counter: {
    inventoryByDefault: false,
    cogsByDefault: false,
    barcodeByDefault: false,
    queueWorkflow: null,
  },
  food_service: {
    inventoryByDefault: false,
    cogsByDefault: false,
    barcodeByDefault: false,
    queueWorkflow: "restaurant",
  },
  food_cart_quick_service: {
    inventoryByDefault: false,
    cogsByDefault: false,
    barcodeByDefault: false,
    queueWorkflow: "restaurant",
  },
  retail_inventory: {
    inventoryByDefault: true,
    cogsByDefault: true,
    barcodeByDefault: true,
    queueWorkflow: null,
  },
  produce_inventory: {
    inventoryByDefault: true,
    cogsByDefault: true,
    barcodeByDefault: true,
    queueWorkflow: null,
  },
  fashion_variant: {
    inventoryByDefault: true,
    cogsByDefault: true,
    barcodeByDefault: true,
    queueWorkflow: null,
  },
  pharmacy_inventory: {
    inventoryByDefault: true,
    cogsByDefault: true,
    barcodeByDefault: true,
    queueWorkflow: null,
  },
  hardware_advanced: {
    inventoryByDefault: true,
    cogsByDefault: true,
    barcodeByDefault: true,
    queueWorkflow: null,
  },
  wholesale_inventory: {
    inventoryByDefault: true,
    cogsByDefault: true,
    barcodeByDefault: true,
    queueWorkflow: null,
  },
  digital_recharge: {
    inventoryByDefault: false,
    cogsByDefault: false,
    barcodeByDefault: false,
    queueWorkflow: null,
  },
  service_only: {
    inventoryByDefault: false,
    cogsByDefault: false,
    barcodeByDefault: false,
    queueWorkflow: null,
  },
};

const PROFILE_ASSISTS: Record<BusinessProfileKey, BusinessAssist> = {
  quick_counter: {
    defaultCategory: "স্ন্যাক্স",
    categoryChips: ["স্ন্যাক্স", "চা/কফি", "কাউন্টার আইটেম"],
    priceHints: ["10", "20", "30", "50"],
  },
  food_service: {
    defaultCategory: "খাবার",
    categoryChips: ["খাবার", "ড্রিংকস", "ডেজার্ট"],
    priceHints: ["50", "80", "120", "180"],
  },
  food_cart_quick_service: {
    defaultCategory: "ফাস্ট ফুড",
    fallbackName: "Chicken Burger",
    quickNames: [
      "Chicken Burger",
      "Beef Burger",
      "Chicken Roll",
      "Egg Roll",
      "French Fries",
      "Soft Drink 250ml",
    ],
    categoryChips: ["ফাস্ট ফুড", "ড্রিংকস", "স্ন্যাক্স", "কম্বো", "অ্যাড-অন"],
    priceHints: ["30", "50", "80", "120"],
  },
  retail_inventory: {
    defaultCategory: "রিটেইল",
    categoryChips: ["রিটেইল", "দৈনন্দিন পণ্য", "পানীয়"],
    priceHints: ["50", "80", "120", "200"],
  },
  produce_inventory: {
    defaultCategory: "সবজি/ফল",
    categoryChips: ["সবজি/ফল", "পাতাজাতীয়", "মসলা"],
    priceHints: ["40", "60", "80", "120"],
  },
  fashion_variant: {
    defaultCategory: "কাপড়",
    categoryChips: ["কাপড়", "ফ্যাশন", "এক্সেসরিজ"],
    priceHints: ["150", "250", "350", "500"],
  },
  pharmacy_inventory: {
    defaultCategory: "ঔষধ",
    categoryChips: ["ঔষধ", "হেলথ কেয়ার", "বেবি কেয়ার"],
    priceHints: ["5", "30", "60", "120"],
  },
  hardware_advanced: {
    defaultCategory: "হার্ডওয়্যার",
    categoryChips: ["সিমেন্ট/বিল্ডিং", "পাইপ/ফিটিংস", "ইলেকট্রিক্যাল", "রং/কেমিক্যাল"],
    priceHints: ["50", "120", "250", "500"],
  },
  wholesale_inventory: {
    defaultCategory: "পাইকারি",
    categoryChips: ["পাইকারি", "বাল্ক", "স্টক লট"],
    priceHints: ["500", "1000", "1500", "2000"],
  },
  digital_recharge: {
    defaultCategory: "রিচার্জ",
    fallbackName: "Mobile Recharge",
    categoryChips: ["রিচার্জ", "ডেটা প্যাক"],
    priceHints: ["20", "50", "100", "200"],
  },
  service_only: {
    defaultCategory: "সেবা",
    categoryChips: ["সেবা", "সার্ভিস চার্জ", "ফি"],
    priceHints: ["100", "200", "500", "1000"],
  },
};

const SELECTABLE_SPECS = [
  {
    key: "tea_stall",
    label: "চায়ের দোকান",
    canonicalKey: "tea_stall",
    profile: "quick_counter",
    selectable: true,
    templateCandidates: ["tea_stall"],
    assist: {
      ...PROFILE_ASSISTS.quick_counter,
      defaultCategory: "চা/কফি",
      categoryChips: ["চা/কফি", "স্ন্যাক্স", "বিস্কুট"],
      priceHints: ["5", "10", "15", "20"],
    },
  },
  {
    key: "sweet_shop",
    label: "মিষ্টির দোকান",
    canonicalKey: "sweet_shop",
    profile: "food_service",
    selectable: true,
    templateCandidates: ["tea_stall", "snacks_stationery"],
    assist: {
      ...PROFILE_ASSISTS.food_service,
      defaultCategory: "মিষ্টি",
      categoryChips: ["মিষ্টি", "দই", "স্ন্যাক্স"],
      priceHints: ["20", "40", "60", "120"],
    },
  },
  {
    key: "food_cart",
    label: "ফুড কার্ট / ছোট খাবারের দোকান",
    canonicalKey: "food_cart",
    profile: "food_cart_quick_service",
    selectable: true,
    templateCandidates: ["food_cart", "tea_stall", "snacks_stationery"],
    assist: {
      ...PROFILE_ASSISTS.food_cart_quick_service,
    },
  },
  {
    key: "restaurant",
    label: "রেস্টুরেন্ট / খাবার হোটেল",
    canonicalKey: "restaurant",
    profile: "food_service",
    selectable: true,
    templateCandidates: ["tea_stall", "snacks_stationery"],
    assist: {
      ...PROFILE_ASSISTS.food_service,
      defaultCategory: "মেনু আইটেম",
      categoryChips: ["মেইন কোর্স", "ড্রিংকস", "ডেজার্ট"],
      priceHints: ["80", "120", "180", "250"],
    },
  },
  {
    key: "grocery",
    label: "মুদি দোকান",
    canonicalKey: "grocery",
    profile: "retail_inventory",
    selectable: true,
    templateCandidates: ["mini_grocery"],
    assist: {
      ...PROFILE_ASSISTS.retail_inventory,
      defaultCategory: "মুদি",
      categoryChips: ["মুদি", "পানীয়", "স্ন্যাক্স"],
      priceHints: ["50", "80", "100", "120"],
    },
  },
  {
    key: "mini_mart",
    label: "মিনি মার্ট / সুপার শপ",
    canonicalKey: "mini_mart",
    profile: "retail_inventory",
    selectable: true,
    templateCandidates: ["mini_grocery"],
    assist: {
      ...PROFILE_ASSISTS.retail_inventory,
      defaultCategory: "সুপার শপ",
      categoryChips: ["গ্রোসারি", "বেভারেজ", "হাউসহোল্ড"],
      priceHints: ["60", "100", "150", "220"],
    },
  },
  {
    key: "fruits_vegetables",
    label: "ফল ও সবজির দোকান",
    canonicalKey: "fruits_vegetables",
    profile: "produce_inventory",
    selectable: true,
    templateCandidates: ["fruits_veg"],
    assist: PROFILE_ASSISTS.produce_inventory,
  },
  {
    key: "snacks_shop",
    label: "স্ন্যাকস / কনফেকশনারি দোকান",
    canonicalKey: "snacks_shop",
    profile: "retail_inventory",
    selectable: true,
    templateCandidates: ["snacks_stationery"],
    assist: {
      ...PROFILE_ASSISTS.retail_inventory,
      defaultCategory: "স্ন্যাক্স",
      categoryChips: ["স্ন্যাক্স", "কনফেকশনারি", "বিস্কুট"],
      priceHints: ["10", "20", "30", "50"],
    },
  },
  {
    key: "stationery",
    label: "স্টেশনারি দোকান",
    canonicalKey: "stationery",
    profile: "retail_inventory",
    selectable: true,
    templateCandidates: ["snacks_stationery"],
    assist: {
      ...PROFILE_ASSISTS.retail_inventory,
      defaultCategory: "স্টেশনারি",
      categoryChips: ["স্টেশনারি", "স্কুল", "অফিস"],
      priceHints: ["10", "20", "50", "100"],
    },
  },
  {
    key: "pharmacy",
    label: "ফার্মেসি / ঔষধের দোকান",
    canonicalKey: "pharmacy",
    profile: "pharmacy_inventory",
    selectable: true,
    templateCandidates: ["pharmacy"],
    assist: PROFILE_ASSISTS.pharmacy_inventory,
  },
  {
    key: "clothing",
    label: "কাপড় / ফ্যাশন দোকান",
    canonicalKey: "clothing",
    profile: "fashion_variant",
    selectable: true,
    templateCandidates: ["clothing"],
    assist: PROFILE_ASSISTS.fashion_variant,
  },
  {
    key: "cosmetics_gift",
    label: "কসমেটিকস / গিফট দোকান",
    canonicalKey: "cosmetics_gift",
    profile: "retail_inventory",
    selectable: true,
    templateCandidates: ["cosmetics_gift"],
    assist: {
      ...PROFILE_ASSISTS.retail_inventory,
      defaultCategory: "কসমেটিকস",
      categoryChips: ["কসমেটিকস", "গিফট", "হেয়ার কেয়ার"],
      priceHints: ["60", "80", "120", "200"],
    },
  },
  {
    key: "mobile_recharge",
    label: "মোবাইল রিচার্জ / টেলিকম দোকান",
    canonicalKey: "mobile_recharge",
    profile: "digital_recharge",
    selectable: true,
    templateCandidates: ["mobile_recharge"],
    assist: PROFILE_ASSISTS.digital_recharge,
  },
  {
    key: "mobile_accessories",
    label: "মোবাইল এক্সেসরিজ দোকান",
    canonicalKey: "mobile_accessories",
    profile: "retail_inventory",
    selectable: true,
    templateCandidates: ["cosmetics_gift", "mini_grocery"],
    assist: {
      ...PROFILE_ASSISTS.retail_inventory,
      defaultCategory: "মোবাইল এক্সেসরিজ",
      categoryChips: ["চার্জার", "কেবল", "কভার"],
      priceHints: ["80", "150", "250", "500"],
    },
  },
  {
    key: "electronics",
    label: "ইলেকট্রনিক্স দোকান",
    canonicalKey: "electronics",
    profile: "retail_inventory",
    selectable: true,
    templateCandidates: ["hardware", "cosmetics_gift"],
    assist: {
      ...PROFILE_ASSISTS.retail_inventory,
      defaultCategory: "ইলেকট্রনিক্স",
      categoryChips: ["ডিভাইস", "অ্যাকসেসরিজ", "সার্ভিস পার্টস"],
      priceHints: ["200", "500", "1000", "2500"],
    },
  },
  {
    key: "hardware",
    label: "হার্ডওয়্যার দোকান",
    canonicalKey: "hardware",
    profile: "hardware_advanced",
    selectable: true,
    templateCandidates: ["hardware"],
    assist: PROFILE_ASSISTS.hardware_advanced,
  },
  {
    key: "wholesale",
    label: "পাইকারি দোকান",
    canonicalKey: "wholesale",
    profile: "wholesale_inventory",
    selectable: true,
    templateCandidates: ["mini_wholesale"],
    assist: PROFILE_ASSISTS.wholesale_inventory,
  },
  {
    key: "service_business",
    label: "সেবা ব্যবসা",
    canonicalKey: "service_business",
    profile: "service_only",
    selectable: true,
    templateCandidates: [],
    assist: PROFILE_ASSISTS.service_only,
  },
  {
    key: "general_retail",
    label: "সাধারণ দোকান / অন্যান্য",
    canonicalKey: "general_retail",
    profile: "retail_inventory",
    selectable: true,
    templateCandidates: ["mini_grocery", "snacks_stationery"],
    assist: {
      ...PROFILE_ASSISTS.retail_inventory,
      defaultCategory: "সাধারণ পণ্য",
      categoryChips: ["সাধারণ পণ্য", "দৈনন্দিন", "কাউন্টার"],
      priceHints: ["20", "50", "100", "200"],
    },
  },
] as const satisfies readonly Omit<BusinessTypeSpec, "featureDefaults">[];

const LEGACY_SPECS = [
  {
    key: "pan_cigarette",
    label: "পান/সিগারেট দোকান",
    canonicalKey: "general_retail",
    profile: "quick_counter",
    selectable: false,
    templateCandidates: ["pan_cigarette"],
    assist: {
      ...PROFILE_ASSISTS.quick_counter,
      defaultCategory: "পান/সিগারেট",
      categoryChips: ["পান/সিগারেট", "স্ন্যাক্স", "রিচার্জ"],
      priceHints: ["5", "10", "12", "20"],
    },
  },
  {
    key: "fruits_veg",
    label: "সবজি/ফল",
    canonicalKey: "fruits_vegetables",
    profile: "produce_inventory",
    selectable: false,
    templateCandidates: ["fruits_veg"],
    assist: PROFILE_ASSISTS.produce_inventory,
  },
  {
    key: "snacks_stationery",
    label: "স্ন্যাক্স/স্টেশনারি",
    canonicalKey: "general_retail",
    profile: "retail_inventory",
    selectable: false,
    templateCandidates: ["snacks_stationery"],
    assist: {
      ...PROFILE_ASSISTS.retail_inventory,
      defaultCategory: "স্ন্যাক্স/স্টেশনারি",
      categoryChips: ["স্ন্যাক্স", "স্টেশনারি", "কাউন্টার"],
      priceHints: ["10", "20", "30", "50"],
    },
  },
  {
    key: "mini_grocery",
    label: "মিনি মুদি",
    canonicalKey: "grocery",
    profile: "retail_inventory",
    selectable: false,
    templateCandidates: ["mini_grocery"],
    assist: {
      ...PROFILE_ASSISTS.retail_inventory,
      defaultCategory: "মুদি",
      categoryChips: ["মুদি", "পানীয়", "স্ন্যাক্স"],
      priceHints: ["50", "80", "100", "120"],
    },
  },
  {
    key: "mini_wholesale",
    label: "মিনি হোলসেল",
    canonicalKey: "wholesale",
    profile: "wholesale_inventory",
    selectable: false,
    templateCandidates: ["mini_wholesale"],
    assist: PROFILE_ASSISTS.wholesale_inventory,
  },
] as const satisfies readonly Omit<BusinessTypeSpec, "featureDefaults">[];

const specEntries = [...SELECTABLE_SPECS, ...LEGACY_SPECS].map((spec) => [
  spec.key,
  {
    ...spec,
    featureDefaults: PROFILE_FEATURE_DEFAULTS[spec.profile],
  },
]);

export type CanonicalBusinessType = (typeof SELECTABLE_SPECS)[number]["key"];
export type LegacyBusinessType = (typeof LEGACY_SPECS)[number]["key"];
export type BusinessType = CanonicalBusinessType | LegacyBusinessType;

export const BUSINESS_TYPE_SPECS = Object.fromEntries(specEntries) as Record<
  BusinessType,
  BusinessTypeSpec
>;

export const DEFAULT_BUSINESS_TYPE: CanonicalBusinessType = "tea_stall";
export const DEFAULT_FALLBACK_BUSINESS_TYPE: CanonicalBusinessType = "general_retail";

export const businessTypeOptions = SELECTABLE_SPECS.map((spec) => ({
  id: spec.key,
  label: spec.label,
}));

function normalizeBusinessTypeInput(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s/-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function isBusinessTypeKey(value?: string | null): value is BusinessType {
  const normalized = normalizeBusinessTypeInput(value);
  return Boolean(normalized) && normalized in BUSINESS_TYPE_SPECS;
}

export function getBusinessTypeSpec(value?: string | null) {
  const normalized = normalizeBusinessTypeInput(value);
  if (isBusinessTypeKey(normalized)) {
    return BUSINESS_TYPE_SPECS[normalized];
  }
  return BUSINESS_TYPE_SPECS[DEFAULT_FALLBACK_BUSINESS_TYPE];
}

export function canonicalizeBusinessTypeKey(value?: string | null): CanonicalBusinessType {
  return getBusinessTypeSpec(value).canonicalKey as CanonicalBusinessType;
}

export function resolveBusinessTypeStorageKey(value?: string | null) {
  const normalized = normalizeBusinessTypeInput(value);
  if (!normalized) return DEFAULT_BUSINESS_TYPE;
  if (isBusinessTypeKey(normalized)) {
    return BUSINESS_TYPE_SPECS[normalized].canonicalKey;
  }
  return normalized;
}

export function getBusinessTypeProfileKey(value?: string | null): BusinessProfileKey {
  return getBusinessTypeSpec(value).profile;
}

export function getBusinessTypeLabel(value?: string | null) {
  const normalized = normalizeBusinessTypeInput(value);
  if (isBusinessTypeKey(normalized)) {
    return BUSINESS_TYPE_SPECS[normalized].label;
  }
  return normalized ? normalized.replace(/_/g, " ") : BUSINESS_TYPE_SPECS[DEFAULT_BUSINESS_TYPE].label;
}

export function getBusinessTypeTemplateCandidates(value?: string | null) {
  const normalized = normalizeBusinessTypeInput(value);
  const spec = getBusinessTypeSpec(normalized);
  return Array.from(
    new Set(
      [normalized, spec.key, spec.canonicalKey, ...spec.templateCandidates]
        .map((item) => normalizeBusinessTypeInput(item))
        .filter(Boolean),
    ),
  );
}

export function getBusinessTypeFeatureDefaults(value?: string | null) {
  return getBusinessTypeSpec(value).featureDefaults;
}

export function usesInventoryByDefault(value?: string | null) {
  return getBusinessTypeFeatureDefaults(value).inventoryByDefault;
}

export function usesCogsByDefault(value?: string | null) {
  return getBusinessTypeFeatureDefaults(value).cogsByDefault;
}

export function usesBarcodeByDefault(value?: string | null) {
  return getBusinessTypeFeatureDefaults(value).barcodeByDefault;
}

export function getSuggestedQueueWorkflow(value?: string | null) {
  return getBusinessTypeFeatureDefaults(value).queueWorkflow ?? null;
}

export function isCanonicalBusinessType(value?: string | null): value is CanonicalBusinessType {
  const normalized = normalizeBusinessTypeInput(value);
  return businessTypeOptions.some((option) => option.id === normalized);
}

export function getBusinessAssist(value?: string | null): BusinessAssist {
  return getBusinessTypeSpec(value).assist;
}

export function listDefaultBusinessTypeSeedRows() {
  return businessTypeOptions.map((option) => {
    const spec = BUSINESS_TYPE_SPECS[option.id];
    return {
      key: spec.key,
      label: spec.label,
      profile: spec.profile,
      featureDefaults: spec.featureDefaults,
    };
  });
}
