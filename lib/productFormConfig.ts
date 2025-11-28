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

type Field =
  | "name"
  | "sellPrice"
  | "buyPrice"
  | "unit"
  | "stock"
  | "expiry"
  | "size";

export const businessOptions: { id: BusinessType; label: string }[] = [
  { id: "tea_stall", label: "চা স্টল" },
  { id: "pan_cigarette", label: "পান/সিগারেট দোকান" },
  { id: "mobile_recharge", label: "মোবাইল রিচার্জ" },
  { id: "fruits_veg", label: "ফল/সবজি স্টল" },
  { id: "snacks_stationery", label: "স্ন্যাকস/স্টেশনারি" },
  { id: "mini_grocery", label: "মুদি দোকান" },
  { id: "clothing", label: "পোশাক/গার্মেন্টস" },
  { id: "cosmetics_gift", label: "কসমেটিকস/গিফট" },
  { id: "pharmacy", label: "ফার্মেসি" },
  { id: "mini_wholesale", label: "মিনি হোলসেল" },
];

type FieldConfig = {
  required: Field[];
  optional?: Field[];
  hidden?: Field[];
  defaultStockOn?: boolean;
  units?: string[];
};

export const businessFieldConfig: Record<BusinessType, FieldConfig> = {
  tea_stall: {
    required: ["name", "sellPrice", "stock"],
    hidden: ["buyPrice", "unit", "expiry", "size"],
    defaultStockOn: false,
  },
  pan_cigarette: {
    required: ["name", "sellPrice", "stock"],
    hidden: ["buyPrice", "unit", "expiry", "size"],
    defaultStockOn: false,
  },
  mobile_recharge: {
    required: ["sellPrice", "stock"],
    optional: ["name"],
    hidden: ["buyPrice", "unit", "expiry", "size"],
    defaultStockOn: false,
  },
  fruits_veg: {
    required: ["name", "sellPrice", "unit", "stock"],
    hidden: ["buyPrice", "expiry", "size"],
    units: ["kg", "gm", "pcs"],
    defaultStockOn: true,
  },
  snacks_stationery: {
    required: ["name", "sellPrice", "stock"],
    hidden: ["buyPrice", "unit", "expiry", "size"],
    defaultStockOn: false,
  },
  mini_grocery: {
    required: ["name", "sellPrice", "unit", "stock"],
    optional: ["buyPrice"],
    hidden: ["expiry", "size"],
    units: ["pcs", "kg", "liter"],
    defaultStockOn: true,
  },
  clothing: {
    required: ["name", "sellPrice", "stock"],
    optional: ["buyPrice", "size"],
    hidden: ["unit", "expiry"],
    defaultStockOn: false,
  },
  cosmetics_gift: {
    required: ["name", "sellPrice", "stock"],
    optional: ["buyPrice"],
    hidden: ["unit", "expiry", "size"],
    defaultStockOn: false,
  },
  pharmacy: {
    required: ["name", "sellPrice", "buyPrice", "unit", "stock", "expiry"],
    hidden: ["size"],
    units: ["pcs", "strip", "ml"],
    defaultStockOn: true,
  },
  mini_wholesale: {
    required: ["name", "sellPrice", "buyPrice", "unit", "stock"],
    hidden: ["expiry", "size"],
    units: ["kg", "carton", "box"],
    defaultStockOn: true,
  },
};
