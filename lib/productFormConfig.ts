import {
  BUSINESS_TYPE_SPECS,
  businessTypeOptions,
  type BusinessProfileKey,
  type BusinessType,
  getBusinessTypeProfileKey,
} from "@/lib/business-types";

export type { BusinessType } from "@/lib/business-types";
export const businessOptions = businessTypeOptions;

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

const COMMON_FIELDS: Field[] = ["name", "sellPrice", "buyPrice", "unit", "expiry", "size"];

export const DEFAULT_UNIT_KEYWORD_RULES: UnitKeywordRule[] = [
  { keywords: ["ডিম", "egg"], unit: "pcs" },
  { keywords: ["তেল", "oil", "দুধ", "পানি", "সিরাপ"], unit: "liter" },
  { keywords: ["চিনি", "চাল", "আটা", "ময়দা", "সুজি", "লবণ", "ডাল"], unit: "kg" },
  { keywords: ["চিপস", "প্যাকেট", "বিস্কুট", "চকলেট"], unit: "packet" },
  { keywords: ["স্ট্রিপ", "ট্যাবলেট", "capsule"], unit: "strip" },
  { keywords: ["কাপড়", "টি শার্ট", "শার্ট", "প্যান্ট"], unit: "pcs" },
];

export const HARDWARE_UNIT_KEYWORD_RULES: UnitKeywordRule[] = [
  { keywords: ["সিমেন্ট", "cement", "বালু", "sand"], unit: "bag" },
  { keywords: ["রড", "rod", "পেরেক", "nail", "তার", "wire"], unit: "kg" },
  { keywords: ["পাইপ", "pipe", "এঙ্গেল", "angle", "চ্যানেল"], unit: "ft" },
  { keywords: ["স্ক্রু", "screw", "বোল্ট", "bolt", "নাট", "nut"], unit: "box" },
  { keywords: ["রং", "paint", "থিনার", "thinner", "পুটি"], unit: "liter" },
  {
    keywords: ["ইট", "brick", "টাইলস", "tiles", "সুইচ", "switch", "সকেট", "socket", "হোল্ডার"],
    unit: "pcs",
  },
  { keywords: ["ক্যাবল", "cable"], unit: "coil" },
  { keywords: ["ফিটিংস", "fitting", "এলবো", "elbow", "টি", "tee", "কাপলিং"], unit: "pcs" },
];

function buildFields(overrides: Partial<Record<Field, FieldRule>>): Record<Field, FieldRule> {
  return COMMON_FIELDS.reduce((acc, field) => {
    acc[field] = { required: false, hidden: false, ...(overrides[field] ?? {}) };
    return acc;
  }, {} as Record<Field, FieldRule>);
}

const profileFieldConfig: Record<BusinessProfileKey, BusinessFieldConfig> = {
  quick_counter: {
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
  food_service: {
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
  retail_inventory: {
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
      options: ["pcs", "packet", "box", "dozen", "kg", "gm", "liter", "ml"],
      default: "pcs",
      keywordRules: DEFAULT_UNIT_KEYWORD_RULES,
    },
  },
  produce_inventory: {
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
      options: ["kg", "gm", "pcs"],
      default: "kg",
      keywordRules: DEFAULT_UNIT_KEYWORD_RULES,
    },
  },
  fashion_variant: {
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
  pharmacy_inventory: {
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
  hardware_advanced: {
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
      options: ["pcs", "bag", "kg", "ft", "box", "bundle", "coil", "liter"],
      default: "pcs",
      keywordRules: HARDWARE_UNIT_KEYWORD_RULES,
    },
  },
  wholesale_inventory: {
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
  digital_recharge: {
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
  service_only: {
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
};

export const businessFieldConfig: Record<BusinessType, BusinessFieldConfig> = Object.fromEntries(
  (Object.keys(BUSINESS_TYPE_SPECS) as BusinessType[]).map((key) => [
    key,
    profileFieldConfig[getBusinessTypeProfileKey(key)],
  ])
) as Record<BusinessType, BusinessFieldConfig>;

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
