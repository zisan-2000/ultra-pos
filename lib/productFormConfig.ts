export type BusinessType =
  | "tea_stall"
  | "pan_cigarette"
  | "mobile_recharge"
  | "fruits_veg"
  | "snacks_stationery"
  | "mini_grocery"
  | "clothing"
  | "cosmetics_gift"
  | "pharmacy"
  | "mini_wholesale";

export type Field =
  | "name"
  | "sellPrice"
  | "buyPrice"
  | "unit"
  | "expiry"
  | "size";

type FieldRule = {
  required?: boolean;
  hidden?: boolean;
};

export type StockRule = {
  enabledByDefault: boolean;
  requiredWhenEnabled: boolean;
};

export type UnitKeywordRule = { keywords: string[]; unit: string };

export type UnitRule = {
  enabled: boolean;
  default?: string;
  options: string[];
  keywordRules?: UnitKeywordRule[];
};

export type BusinessFieldConfig = {
  fields: Record<Field, FieldRule>;
  stock: StockRule;
  unit: UnitRule;
};

export const businessOptions: { id: BusinessType; label: string }[] = [
  { id: "tea_stall", label: "চা/কফি দোকান" },
  { id: "pan_cigarette", label: "পান/সিগারেট দোকান" },
  { id: "mobile_recharge", label: "মোবাইল রিচার্জ" },
  { id: "fruits_veg", label: "সবজি/ফল" },
  { id: "snacks_stationery", label: "স্ন্যাক্স/স্টেশনারি" },
  { id: "mini_grocery", label: "মিনি মুদি" },
  { id: "clothing", label: "কাপড়/গার্মেন্টস" },
  { id: "cosmetics_gift", label: "কসমেটিকস/গিফট" },
  { id: "pharmacy", label: "ফার্মেসি" },
  { id: "mini_wholesale", label: "হোলসেল" },
];

const COMMON_FIELDS: Field[] = ["name", "sellPrice", "buyPrice", "unit", "expiry", "size"];

export const DEFAULT_UNIT_KEYWORD_RULES: UnitKeywordRule[] = [
  { keywords: ["ডিম", "egg"], unit: "pcs" },
  { keywords: ["তেল", "oil", "দুধ", "পানি", "সিরাপ"], unit: "liter" },
  { keywords: ["চিনি", "চাল", "আটা", "ময়দা", "সুজি", "লবণ", "ডাল"], unit: "kg" },
  { keywords: ["চিপস", "প্যাকেট", "বিস্কুট", "চকলেট"], unit: "packet" },
  { keywords: ["স্ট্রিপ", "ট্যাবলেট", "capsule"], unit: "strip" },
  { keywords: ["কাপড়", "টি শার্ট", "শার্ট", "প্যান্ট"], unit: "pcs" },
];

function buildFields(overrides: Partial<Record<Field, FieldRule>>): Record<Field, FieldRule> {
  return COMMON_FIELDS.reduce((acc, field) => {
    acc[field] = { required: false, hidden: false, ...(overrides[field] ?? {}) };
    return acc;
  }, {} as Record<Field, FieldRule>);
}

export const businessFieldConfig: Record<BusinessType, BusinessFieldConfig> = {
  tea_stall: {
    fields: buildFields({
      name: { required: true },
      sellPrice: { required: true },
      buyPrice: { hidden: true },
      unit: { hidden: true },
      expiry: { hidden: true },
      size: { hidden: true },
    }),
    stock: { enabledByDefault: false, requiredWhenEnabled: true },
    unit: { enabled: false, options: [] },
  },
  pan_cigarette: {
    fields: buildFields({
      name: { required: true },
      sellPrice: { required: true },
      buyPrice: { hidden: true },
      unit: { hidden: true },
      expiry: { hidden: true },
      size: { hidden: true },
    }),
    stock: { enabledByDefault: false, requiredWhenEnabled: true },
    unit: { enabled: false, options: [] },
  },
  mobile_recharge: {
    fields: buildFields({
      name: { hidden: true },
      sellPrice: { required: true },
      buyPrice: { hidden: true },
      unit: { hidden: true },
      expiry: { hidden: true },
      size: { hidden: true },
    }),
    stock: { enabledByDefault: false, requiredWhenEnabled: true },
    unit: { enabled: false, options: [] },
  },
  fruits_veg: {
    fields: buildFields({
      name: { required: true },
      sellPrice: { required: true },
      unit: { required: true },
      buyPrice: { hidden: true },
      expiry: { hidden: true },
      size: { hidden: true },
    }),
    stock: { enabledByDefault: true, requiredWhenEnabled: true },
    unit: {
      enabled: true,
      options: ["kg", "gm", "pcs"],
      default: "kg",
      keywordRules: DEFAULT_UNIT_KEYWORD_RULES,
    },
  },
  snacks_stationery: {
    fields: buildFields({
      name: { required: true },
      sellPrice: { required: true },
      buyPrice: { hidden: true },
      unit: { hidden: true },
      expiry: { hidden: true },
      size: { hidden: true },
    }),
    stock: { enabledByDefault: false, requiredWhenEnabled: true },
    unit: { enabled: false, options: [] },
  },
  mini_grocery: {
    fields: buildFields({
      name: { required: true },
      sellPrice: { required: true },
      buyPrice: {},
      unit: { required: true },
      expiry: { hidden: true },
      size: { hidden: true },
    }),
    stock: { enabledByDefault: true, requiredWhenEnabled: true },
    unit: {
      enabled: true,
      options: ["pcs", "kg", "liter"],
      default: "kg",
      keywordRules: DEFAULT_UNIT_KEYWORD_RULES,
    },
  },
  clothing: {
    fields: buildFields({
      name: { required: true },
      sellPrice: { required: true },
      buyPrice: {},
      unit: { hidden: true },
      expiry: { hidden: true },
      size: {},
    }),
    stock: { enabledByDefault: false, requiredWhenEnabled: true },
    unit: { enabled: false, options: [] },
  },
  cosmetics_gift: {
    fields: buildFields({
      name: { required: true },
      sellPrice: { required: true },
      buyPrice: {},
      unit: { hidden: true },
      expiry: { hidden: true },
      size: { hidden: true },
    }),
    stock: { enabledByDefault: false, requiredWhenEnabled: true },
    unit: { enabled: false, options: [] },
  },
  pharmacy: {
    fields: buildFields({
      name: { required: true },
      sellPrice: { required: true },
      buyPrice: { required: true },
      unit: { required: true },
      expiry: { required: true },
      size: { hidden: true },
    }),
    stock: { enabledByDefault: true, requiredWhenEnabled: true },
    unit: {
      enabled: true,
      options: ["pcs", "strip", "ml"],
      default: "strip",
      keywordRules: DEFAULT_UNIT_KEYWORD_RULES,
    },
  },
  mini_wholesale: {
    fields: buildFields({
      name: { required: true },
      sellPrice: { required: true },
      buyPrice: { required: true },
      unit: { required: true },
      expiry: { hidden: true },
      size: { hidden: true },
    }),
    stock: { enabledByDefault: true, requiredWhenEnabled: true },
    unit: {
      enabled: true,
      options: ["kg", "carton", "box"],
      default: "carton",
      keywordRules: DEFAULT_UNIT_KEYWORD_RULES,
    },
  },
};

function validateConfig(configs: Record<string, BusinessFieldConfig>) {
  Object.entries(configs).forEach(([type, config]) => {
    Object.entries(config.fields).forEach(([field, rule]) => {
      if (rule.hidden && rule.required) {
        throw new Error(`Config error for ${type}: field "${field}" cannot be hidden and required`);
      }
    });
  });
}

validateConfig(businessFieldConfig);

export { validateConfig };
