// app/dashboard/admin/business-types/page.tsx

import {
  listBusinessTypes,
  syncDefaultBusinessTypes,
  upsertBusinessType,
  getBusinessType,
  setBusinessTypeActive,
} from "@/app/actions/business-types";
import {
  businessFieldConfig as STATIC_CONFIGS,
  businessOptions,
  type BusinessType,
  type Field,
} from "@/lib/productFormConfig";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function handleSyncDefaults() {
  "use server";
  await syncDefaultBusinessTypes();
  revalidatePath("/dashboard/admin/business-types");
}

async function handleCreateFromStatic(formData: FormData) {
  "use server";
  const key = (formData.get("key") as string | null)?.trim() as BusinessType | null;
  if (!key) return;

  const config = STATIC_CONFIGS[key] ?? STATIC_CONFIGS.mini_grocery;
  const label = formData.get("label")?.toString().trim() || key;

  await upsertBusinessType({
    key,
    label,
    isActive: true,
    fieldRules: config.fields,
    stockRules: config.stock,
    unitRules: config.unit,
  });
  revalidatePath("/dashboard/admin/business-types");
}

async function handleToggleActive(formData: FormData) {
  "use server";
  const key = (formData.get("key") as string | null)?.trim();
  const activeRaw = formData.get("isActive") as string | null;
  if (!key) return;
  const isActive = activeRaw === "true";
  await setBusinessTypeActive(key, isActive);
  revalidatePath("/dashboard/admin/business-types");
}

async function handleEditConfig(formData: FormData) {
  "use server";
  const key = (formData.get("key") as string | null)?.trim();
  if (!key) return;

  const label = (formData.get("label") as string | null)?.trim() || undefined;
  const isActive = formData.get("isActive") === "on";
  const fieldsRaw = (formData.get("fields") as string | null)?.trim() || "";
  const stockRaw = (formData.get("stock") as string | null)?.trim() || "";
  const unitRaw = (formData.get("unit") as string | null)?.trim() || "";

  const existing = (await getBusinessType(key)) ?? null;
  const fallbackConfig = STATIC_CONFIGS[key as BusinessType] ?? STATIC_CONFIGS.mini_grocery;

  const existingFields = (existing?.fieldRules as any) ?? fallbackConfig.fields;
  const existingStock = (existing?.stockRules as any) ?? fallbackConfig.stock;
  const existingUnit = (existing?.unitRules as any) ?? fallbackConfig.unit;

  const parseJson = (value: string, fallback: any) => {
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  };

  const fieldRules = parseJson(fieldsRaw, existingFields);
  const stockRules = parseJson(stockRaw, existingStock);
  const unitRules = parseJson(unitRaw, existingUnit);

  await upsertBusinessType({
    key,
    label: label || existing?.label || key,
    isActive,
    fieldRules,
    stockRules,
    unitRules,
  });

  revalidatePath("/dashboard/admin/business-types");
}

// Structured edit (no JSON needed)
const ALL_FIELDS: Field[] = ["name", "sellPrice", "buyPrice", "unit", "expiry", "size"];

async function handleStructuredEdit(formData: FormData) {
  "use server";
  const key = (formData.get("key") as string | null)?.trim();
  if (!key) return;

  const existing = (await getBusinessType(key)) ?? null;
  const fallbackConfig = STATIC_CONFIGS[key as BusinessType] ?? STATIC_CONFIGS.mini_grocery;

  const label = (formData.get("label") as string | null)?.trim() || existing?.label || key;
  const isActive = formData.get("isActive") === "on";

  const fieldRules: Record<Field, any> = {} as any;
  for (const f of ALL_FIELDS) {
    fieldRules[f] = {
      required: formData.get(`req:${f}`) === "on",
      hidden: formData.get(`hid:${f}`) === "on",
    };
  }

  const stockRules = {
    enabledByDefault: formData.get("stock:enabledByDefault") === "on",
    requiredWhenEnabled: formData.get("stock:requiredWhenEnabled") === "on",
  };

  const unitEnabled = formData.get("unit:enabled") === "on";
  const rawOptions = (formData.get("unitOptions") as string | null) || "";
  const unitOptions = Array.from(
    new Set(
      rawOptions
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  const existingUnit = (existing?.unitRules as any) ?? fallbackConfig.unit;
  const unitDefault =
    (formData.get("unitDefault") as string | null)?.trim().toLowerCase() ||
    existingUnit.default ||
    unitOptions[0] ||
    "";

  const unitRules = {
    enabled: unitEnabled,
    options: unitOptions.length ? unitOptions : existingUnit.options || [],
    default: unitDefault || undefined,
    keywordRules: existingUnit.keywordRules || [],
  };

  await upsertBusinessType({
    key,
    label,
    isActive,
    fieldRules,
    stockRules,
    unitRules,
  });

  revalidatePath("/dashboard/admin/business-types");
}

export default async function BusinessTypesAdminPage() {
  let types: Awaited<ReturnType<typeof listBusinessTypes>> | null = null;
  let error: string | null = null;

  try {
    types = await listBusinessTypes();
  } catch (err: any) {
    error = err?.message || "Unable to load business types (Super Admin only).";
  }

  const missingKeys = Object.keys(STATIC_CONFIGS).filter(
    (key) => !types?.some((t) => t.key === key),
  );

  const formatJson = (value: any) => JSON.stringify(value ?? {}, null, 2);

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Business Types (Admin)</h1>
        <p className="text-gray-600">
          Super Admin can manage business type rules without redeploy. Changes apply immediately.
        </p>
      </div>

      {error ? (
        <div className="border border-red-200 bg-red-50 text-red-800 rounded-lg p-4">
          {error}
        </div>
      ) : null}

      <form action={handleSyncDefaults} className="flex flex-wrap gap-3 items-center">
        <button
          type="submit"
          className="px-4 py-2 rounded-md bg-slate-900 text-white font-semibold hover:bg-slate-800"
        >
          Sync default configs from code
        </button>
        <span className="text-sm text-gray-600">
          Pulls current code configs into DB (upsert).
        </span>
      </form>

      {missingKeys.length > 0 ? (
        <div className="border border-amber-200 bg-amber-50 text-amber-800 rounded-lg p-3 text-sm">
          Missing in DB: {missingKeys.join(", ")}
        </div>
      ) : null}

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Key
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Label
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Active
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Updated
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {types?.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-3 text-sm font-mono text-gray-900">{t.key}</td>
                <td className="px-4 py-3 text-sm text-gray-900">{t.label}</td>
                <td className="px-4 py-3 text-sm">
                  <span
                    className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                      t.isActive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                    }`}
                  >
                    {t.isActive ? "Active" : "Disabled"}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {new Date(t.updatedAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {!types?.length ? (
              <tr>
                <td className="px-4 py-4 text-sm text-gray-500" colSpan={4}>
                  No business types in database yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="border border-gray-200 rounded-xl p-4 space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Add from static config</h2>
        <p className="text-sm text-gray-600">
          Pick an existing code config and push it to DB (edit later via DB/UI).
        </p>
        <form action={handleCreateFromStatic} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            name="key"
            className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            defaultValue=""
          >
            <option value="" disabled>
              Choose a business type
            </option>
            {businessOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.id} — {opt.label}
              </option>
            ))}
          </select>
          <input
            name="label"
            type="text"
            className="border border-gray-300 rounded-md px-3 py-2 text-sm flex-1"
            placeholder="Label (optional, defaults to code label)"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-md bg-emerald-600 text-white font-semibold hover:bg-emerald-700"
          >
            Upsert
          </button>
        </form>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Manage configs</h2>
        <p className="text-sm text-gray-600">
          Edit label/active, and adjust field/stock/unit rules inline. Save applies immediately
          (validation enforced).
        </p>

        {/* Create new business type */}
        <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm text-emerald-700 font-semibold">Create new business type</div>
              <p className="text-xs text-emerald-700/80">
                Key is unique. Defaults: name & sellPrice required; others optional.
              </p>
            </div>
          </div>
          <form action={handleStructuredEdit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                name="key"
                type="text"
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                placeholder="unique key (e.g., bakery)"
                required
              />
              <input
                name="label"
                type="text"
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                placeholder="Display label"
              />
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" name="isActive" className="w-4 h-4" defaultChecked />
                <span>Active</span>
              </label>
            </div>

            <div className="border border-gray-100 rounded-lg p-3 space-y-2 bg-white">
              <div className="text-sm font-semibold text-gray-800">Fields</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {ALL_FIELDS.map((f) => (
                  <div
                    key={`create-${f}`}
                    className="border border-gray-200 rounded-md px-3 py-2 flex flex-col gap-1"
                  >
                    <div className="text-sm font-medium text-gray-900">{f}</div>
                    <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        name={`req:${f}`}
                        className="w-4 h-4"
                        defaultChecked={f === "name" || f === "sellPrice"}
                      />
                      <span>Required</span>
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                      <input type="checkbox" name={`hid:${f}`} className="w-4 h-4" />
                      <span>Hidden</span>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="border border-gray-100 rounded-lg p-3 space-y-2 bg-white">
                <div className="text-sm font-semibold text-gray-800">Stock</div>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" name="stock:enabledByDefault" className="w-4 h-4" />
                  <span>Enabled by default</span>
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" name="stock:requiredWhenEnabled" className="w-4 h-4" />
                  <span>Quantity required when enabled</span>
                </label>
              </div>

              <div className="border border-gray-100 rounded-lg p-3 space-y-2 bg-white">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-800">Unit</div>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" name="unit:enabled" className="w-4 h-4" />
                    <span>Enable unit field</span>
                  </label>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-600">Options (comma separated)</label>
                  <input
                    name="unitOptions"
                    type="text"
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="pcs, kg, liter"
                  />
                  <label className="text-xs text-gray-600">Default unit</label>
                  <input
                    name="unitDefault"
                    type="text"
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="pcs"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="px-4 py-2 rounded-md bg-emerald-600 text-white font-semibold hover:bg-emerald-700"
              >
                Create & save
              </button>
            </div>
          </form>
        </div>

        <div className="space-y-3">
          {types?.map((t) => {
            const fields = (t.fieldRules as any) ?? {};
            const stock = (t.stockRules as any) ?? {};
            const unit = (t.unitRules as any) ?? {};
            const unitOptions = (unit.options || []) as string[];

            return (
              <div
                key={t.key}
                className="border border-gray-200 rounded-xl p-4 space-y-3 bg-white shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-3 justify-between">
                  <div>
                    <div className="text-sm text-gray-500 font-mono">{t.key}</div>
                    <div className="text-lg font-semibold text-gray-900">{t.label}</div>
                  </div>
                  <form action={handleToggleActive}>
                    <input type="hidden" name="key" value={t.key} />
                    <input type="hidden" name="isActive" value={(!t.isActive).toString()} />
                    <button
                      type="submit"
                      className={`px-3 py-2 text-sm rounded-md border ${
                        t.isActive
                          ? "border-red-200 text-red-700 bg-red-50 hover:border-red-300"
                          : "border-emerald-200 text-emerald-700 bg-emerald-50 hover:border-emerald-300"
                      }`}
                    >
                      {t.isActive ? "Disable" : "Enable"}
                    </button>
                  </form>
                </div>

                <form action={handleStructuredEdit} className="space-y-3">
                  <input type="hidden" name="key" value={t.key} />

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      name="label"
                      type="text"
                      className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                      placeholder="Label"
                      defaultValue={t.label}
                    />
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" name="isActive" className="w-4 h-4" defaultChecked={t.isActive} />
                      <span>Active</span>
                    </label>
                    <div className="text-xs text-gray-500">
                      Save will validate and upsert this config.
                    </div>
                  </div>

                  <div className="border border-gray-100 rounded-lg p-3 space-y-2">
                    <div className="text-sm font-semibold text-gray-800">Fields</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {ALL_FIELDS.map((f) => {
                        const rule = (fields as any)[f] || {};
                        return (
                          <div
                            key={f}
                            className="border border-gray-200 rounded-md px-3 py-2 flex flex-col gap-1"
                          >
                            <div className="text-sm font-medium text-gray-900">{f}</div>
                            <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                              <input type="checkbox" name={`req:${f}`} className="w-4 h-4" defaultChecked={!!rule.required} />
                              <span>Required</span>
                            </label>
                            <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                              <input type="checkbox" name={`hid:${f}`} className="w-4 h-4" defaultChecked={!!rule.hidden} />
                              <span>Hidden</span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="border border-gray-100 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-gray-800">Stock</div>
                      </div>
                      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          name="stock:enabledByDefault"
                          className="w-4 h-4"
                          defaultChecked={!!stock.enabledByDefault}
                        />
                        <span>Enabled by default</span>
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          name="stock:requiredWhenEnabled"
                          className="w-4 h-4"
                          defaultChecked={!!stock.requiredWhenEnabled}
                        />
                        <span>Quantity required when enabled</span>
                      </label>
                    </div>

                    <div className="border border-gray-100 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-gray-800">Unit</div>
                        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            name="unit:enabled"
                            className="w-4 h-4"
                            defaultChecked={!!unit.enabled}
                          />
                          <span>Enable unit field</span>
                        </label>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs text-gray-600">Options (comma separated)</label>
                        <input
                          name="unitOptions"
                          type="text"
                          className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                          placeholder="kg, gm, pcs"
                          defaultValue={unitOptions.join(", ")}
                        />
                        <label className="text-xs text-gray-600">Default unit</label>
                        <select
                          name="unitDefault"
                          className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                          defaultValue={unit.default || unitOptions[0] || ""}
                        >
                          <option value="">(auto)</option>
                          {unitOptions.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700"
                    >
                      Save changes
                    </button>
                  </div>
                </form>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
