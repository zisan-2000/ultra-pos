import {
  BusinessType,
  businessFieldConfig,
} from "@/lib/productFormConfig";

const DEFAULT_UNITS = [
  "pcs",
  "packet",
  "box",
  "dozen",
  "kg",
  "gm",
  "liter",
  "ml",
  "ft",
];

export function useProductFields(businessType: BusinessType) {
  const config = businessFieldConfig[businessType];

  const isFieldVisible = (field: string) =>
    !(config.hidden ?? []).includes(field as any);

  const isFieldRequired = (field: string) =>
    (config.required ?? []).includes(field as any);

  const defaultStockOn = config.defaultStockOn ?? false;
  const unitOptions = config.units ?? DEFAULT_UNITS;

  return {
    config,
    isFieldVisible,
    isFieldRequired,
    defaultStockOn,
    unitOptions,
  };
}
