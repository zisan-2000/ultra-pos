import {
  BusinessType,
  Field,
  businessFieldConfig,
  DEFAULT_UNIT_KEYWORD_RULES,
  type UnitKeywordRule,
} from "@/lib/productFormConfig";

const FALLBACK_UNITS = ["pcs", "packet", "box", "dozen", "kg", "gm", "liter", "ml", "ft"];
const FIELDS: Field[] = ["name", "sellPrice", "buyPrice", "unit", "expiry", "size"];

export function useProductFields(businessType: BusinessType | string) {
  const fallbackConfig = businessFieldConfig.mini_grocery;
  const config = businessFieldConfig[businessType as BusinessType] ?? fallbackConfig;

  const isFieldVisible = (field: Field) => !config.fields[field]?.hidden;
  const isFieldRequired = (field: Field) => Boolean(config.fields[field]?.required);

  const stock = config.stock;
  const unitRule = config.unit;

  const keywordRules: UnitKeywordRule[] = unitRule.keywordRules ?? DEFAULT_UNIT_KEYWORD_RULES;

  const unitOptions = unitRule.enabled
    ? unitRule.options.length > 0
      ? unitRule.options
      : FALLBACK_UNITS
    : [];
  const defaultUnit = unitRule.enabled ? unitRule.default || unitOptions[0] || "pcs" : undefined;

  const suggestUnit = (name: string, availableUnits: string[] = unitOptions) => {
    if (!unitRule.enabled) return undefined;
    const lower = name.toLowerCase();
    for (const rule of keywordRules) {
      if (rule.keywords.some((k) => lower.includes(k.toLowerCase()))) {
        return availableUnits.includes(rule.unit) ? rule.unit : rule.unit;
      }
    }
    if (defaultUnit && availableUnits.includes(defaultUnit)) return defaultUnit;
    return defaultUnit;
  };

  const visibleFields = FIELDS.filter((f) => isFieldVisible(f));

  return {
    config,
    isFieldVisible,
    isFieldRequired,
    visibleFields,
    stock,
    unitOptions,
    defaultUnit,
    suggestUnit,
    keywordRules,
  };
}
