// app/dashboard/admin/business-types/BusinessTypesClient.tsx

"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useSyncStatus } from "@/lib/sync/sync-status";
import { queueAdminAction } from "@/lib/sync/queue";
import {
  businessFieldConfig as STATIC_CONFIGS,
  businessOptions,
  type BusinessType,
  type Field,
} from "@/lib/productFormConfig";

type BusinessTypeRow = {
  id: string;
  key: string;
  label: string;
  isActive: boolean;
  updatedAt: string | Date;
  fieldRules?: any;
  stockRules?: any;
  unitRules?: any;
};

type UsageInfo = { shopCount: number; templateCount: number };

type Props = {
  initialTypes: BusinessTypeRow[];
  initialUsage: Record<string, UsageInfo>;
  error?: string | null;
  onSyncDefaults: (formData: FormData) => void | Promise<void>;
  onCreateFromStatic: (formData: FormData) => void | Promise<void>;
  onToggleActive: (formData: FormData) => void | Promise<void>;
  onDeleteBusinessType: (formData: FormData) => void | Promise<void>;
  onStructuredEdit: (formData: FormData) => void | Promise<void>;
};

// Structured edit (no JSON needed)
const ALL_FIELDS: Field[] = ["name", "sellPrice", "buyPrice", "unit", "expiry", "size"];

export default function BusinessTypesClient({
  initialTypes,
  initialUsage,
  error,
  onSyncDefaults,
  onCreateFromStatic,
  onToggleActive,
  onDeleteBusinessType,
  onStructuredEdit,
}: Props) {
  const online = useOnlineStatus();
  const router = useRouter();
  const { pendingCount, syncing, lastSyncAt } = useSyncStatus();
  const [types, setTypes] = useState<BusinessTypeRow[]>(initialTypes || []);
  const [usage, setUsage] = useState<Record<string, UsageInfo>>(initialUsage || {});
  const refreshInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const REFRESH_MIN_INTERVAL_MS = 15_000;
  const serverSnapshotRef = useRef({
    types: initialTypes,
    usage: initialUsage,
  });

  const cacheKey = "admin:business-types";
  const usageKey = "admin:business-types-usage";

  const updateTypes = useCallback(
    (updater: (prev: BusinessTypeRow[]) => BusinessTypeRow[]) => {
      setTypes((prev) => {
        const next = updater(prev);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(next));
        } catch {
          // ignore cache errors
        }
        return next;
      });
    },
    [cacheKey],
  );

  const updateUsage = useCallback(
    (updater: (prev: Record<string, UsageInfo>) => Record<string, UsageInfo>) => {
      setUsage((prev) => {
        const next = updater(prev);
        try {
          localStorage.setItem(usageKey, JSON.stringify(next));
        } catch {
          // ignore cache errors
        }
        return next;
      });
    },
    [usageKey],
  );

  const buildStructuredPayload = useCallback(
    (formData: FormData) => {
      const rawKey = (formData.get("key") as string | null)?.trim();
      if (!rawKey) return null;
      const key = rawKey.toLowerCase();
      const existing = types.find((t) => t.key === key);
      const fallbackConfig =
        STATIC_CONFIGS[key as BusinessType] ?? STATIC_CONFIGS.mini_grocery;

      const label =
        (formData.get("label") as string | null)?.trim() ||
        existing?.label ||
        key;
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

      const existingUnit = (existing?.unitRules as any) ?? fallbackConfig.unit;
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
      const unitDefault =
        (formData.get("unitDefault") as string | null)
          ?.trim()
          .toLowerCase() ||
        existingUnit.default ||
        unitOptions[0] ||
        "";

      const unitRules = {
        enabled: unitEnabled,
        options: unitOptions.length ? unitOptions : existingUnit.options || [],
        default: unitDefault || undefined,
        keywordRules: existingUnit.keywordRules || [],
      };

      return { key, label, isActive, fieldRules, stockRules, unitRules };
    },
    [types],
  );

  useEffect(() => {
    if (online) {
      if (Array.isArray(initialTypes) && initialTypes.length > 0) {
        setTypes(initialTypes);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(initialTypes));
        } catch {
          // ignore cache errors
        }
      } else if (error) {
        try {
          const raw = localStorage.getItem(cacheKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              setTypes(parsed);
            }
          }
        } catch {
          // ignore cache errors
        }
      }

      if (initialUsage && Object.keys(initialUsage).length > 0) {
        setUsage(initialUsage);
        try {
          localStorage.setItem(usageKey, JSON.stringify(initialUsage));
        } catch {
          // ignore cache errors
        }
      }
      return;
    }

    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setTypes(parsed);
        }
      }
    } catch {
      // ignore cache errors
    }

    try {
      const raw = localStorage.getItem(usageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setUsage(parsed);
        }
      }
    } catch {
      // ignore cache errors
    }
  }, [online, initialTypes, initialUsage, error]);

  useEffect(() => {
    if (
      serverSnapshotRef.current.types !== initialTypes ||
      serverSnapshotRef.current.usage !== initialUsage
    ) {
      serverSnapshotRef.current = { types: initialTypes, usage: initialUsage };
      refreshInFlightRef.current = false;
    }
  }, [initialTypes, initialUsage]);

  useEffect(() => {
    if (!online || !lastSyncAt || syncing || pendingCount > 0) return;
    if (refreshInFlightRef.current) return;
    const now = Date.now();
    if (now - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) return;
    lastRefreshAtRef.current = now;
    refreshInFlightRef.current = true;
    router.refresh();
  }, [online, lastSyncAt, syncing, pendingCount, router]);

  const handleOfflineSyncDefaults = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      if (online) return;
      event.preventDefault();
      await queueAdminAction("business_type_sync_defaults", {});
      alert("Offline: sync defaults queued.");
    },
    [online],
  );

  const handleOfflineCreateFromStatic = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      if (online) return;
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const rawKey = (formData.get("key") as string | null)?.trim();
      if (!rawKey) return;
      const key = rawKey.toLowerCase();
      const label = (formData.get("label") as string | null)?.trim() || key;
      const config =
        STATIC_CONFIGS[key as BusinessType] ?? STATIC_CONFIGS.mini_grocery;

      updateTypes((prev) => {
        const next = [...prev];
        const now = new Date().toISOString();
        const existingIndex = next.findIndex((t) => t.key === key);
        const row = {
          ...(existingIndex >= 0 ? next[existingIndex] : { id: key }),
          key,
          label,
          isActive: true,
          updatedAt: now,
          fieldRules: config.fields,
          stockRules: config.stock,
          unitRules: config.unit,
        };
        if (existingIndex >= 0) {
          next[existingIndex] = row;
        } else {
          next.unshift(row);
        }
        return next;
      });

      updateUsage((prev) => ({
        ...prev,
        [key]: prev[key] ?? { shopCount: 0, templateCount: 0 },
      }));

      await queueAdminAction("business_type_create_from_static", {
        key,
        label,
      });
      alert("Offline: business type queued.");
    },
    [online, updateTypes, updateUsage],
  );

  const handleOfflineToggleActive = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      if (online) return;
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const rawKey = (formData.get("key") as string | null)?.trim();
      if (!rawKey) return;
      const key = rawKey.toLowerCase();
      const isActive = formData.get("isActive") === "true";
      const now = new Date().toISOString();
      updateTypes((prev) =>
        prev.map((t) => (t.key === key ? { ...t, isActive, updatedAt: now } : t)),
      );
      await queueAdminAction("business_type_toggle_active", { key, isActive });
      alert("Offline: status change queued.");
    },
    [online, updateTypes],
  );

  const handleOfflineStructuredEdit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      if (online) return;
      event.preventDefault();
      const submitter = (event.nativeEvent as SubmitEvent)
        .submitter as HTMLButtonElement | null;
      const action = submitter?.dataset.offlineAction || "save";
      const formData = new FormData(event.currentTarget);
      const rawKey = (formData.get("key") as string | null)?.trim();
      if (!rawKey) return;
      const key = rawKey.toLowerCase();

      if (action === "delete") {
        updateTypes((prev) => prev.filter((t) => t.key !== key));
        updateUsage((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        await queueAdminAction("business_type_delete", { key });
        alert("Offline: delete queued.");
        return;
      }

      const payload = buildStructuredPayload(formData);
      if (!payload) return;
      updateTypes((prev) => {
        const next = [...prev];
        const now = new Date().toISOString();
        const existingIndex = next.findIndex((t) => t.key === payload.key);
        const existing = existingIndex >= 0 ? next[existingIndex] : null;
        const row = {
          ...(existing || { id: payload.key }),
          ...payload,
          updatedAt: now,
        };
        if (existingIndex >= 0) {
          next[existingIndex] = row;
        } else {
          next.unshift(row);
        }
        return next;
      });
      updateUsage((prev) => ({
        ...prev,
        [payload.key]: prev[payload.key] ?? { shopCount: 0, templateCount: 0 },
      }));
      await queueAdminAction("business_type_upsert", payload);
      alert("Offline: changes queued.");
    },
    [online, updateTypes, updateUsage, buildStructuredPayload],
  );

  const missingKeys = useMemo(() => {
    return Object.keys(STATIC_CONFIGS).filter(
      (key) => !types?.some((t) => t.key === key),
    );
  }, [types]);

  const showError = online && error;
  const showOfflineEmpty = !online && types.length === 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6">
      {!online && (
        <div className="border border-warning/30 bg-warning-soft text-warning rounded-lg p-3 text-xs font-semibold">
          অফলাইন: আগের Business Types ডাটা দেখানো হচ্ছে।
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-foreground">Business Types (Admin)</h1>
        <p className="text-muted-foreground">
          Super Admin can manage business type rules without redeploy. Changes apply immediately.
        </p>
      </div>

      {showError ? (
        <div className="border border-danger/30 bg-danger-soft text-danger rounded-lg p-4">
          {error}
        </div>
      ) : null}

      {showOfflineEmpty ? (
        <div className="border border-border rounded-lg p-4 text-sm text-muted-foreground">
          Offline: cached business types data not available.
        </div>
      ) : null}

      <fieldset className="space-y-6">
        <form
          action={onSyncDefaults}
          onSubmit={handleOfflineSyncDefaults}
          className="flex flex-wrap gap-3 items-center"
        >
          <button
            type="submit"
            className="px-4 py-2 rounded-md bg-primary-soft text-primary border border-primary/30 font-semibold hover:bg-primary/15 hover:border-primary/40 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Sync default configs from code
          </button>
          <span className="text-sm text-muted-foreground">
            Pulls current code configs into DB (upsert).
          </span>
        </form>

        {missingKeys.length > 0 ? (
          <div className="border border-warning/30 bg-warning-soft text-warning rounded-lg p-3 text-sm">
            Missing in DB: {missingKeys.join(", ")}
          </div>
        ) : null}

        <div className="border border-border rounded-xl overflow-hidden">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Key
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Label
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Active
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {types?.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 text-sm font-mono text-foreground">{t.key}</td>
                  <td className="px-4 py-3 text-sm text-foreground">{t.label}</td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                        t.isActive ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
                      }`}
                    >
                      {t.isActive ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {new Date(t.updatedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
              {!types?.length ? (
                <tr>
                  <td className="px-4 py-4 text-sm text-muted-foreground" colSpan={4}>
                    No business types in database yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="border border-border rounded-xl p-4 space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Add from static config</h2>
          <p className="text-sm text-muted-foreground">
            Pick an existing code config and push it to DB (edit later via DB/UI).
          </p>
          <form
            action={onCreateFromStatic}
            onSubmit={handleOfflineCreateFromStatic}
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <select
              name="key"
              className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              defaultValue=""
            >
              <option value="" disabled>
                Choose a business type
              </option>
              {businessOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.id} - {opt.label}
                </option>
              ))}
            </select>
            <input
              name="label"
              type="text"
              className="border border-border rounded-md px-3 py-2 text-sm flex-1 bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Label (optional, defaults to code label)"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-md bg-primary-soft text-primary border border-primary/30 font-semibold hover:bg-primary/15 hover:border-primary/40"
            >
              Upsert
            </button>
          </form>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Manage configs</h2>
          <p className="text-sm text-muted-foreground">
            Edit label/active, and adjust field/stock/unit rules inline. Save applies immediately
            (validation enforced).
          </p>

          {/* Create new business type */}
          <div className="border border-success/30 bg-success-soft rounded-xl p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm text-success font-semibold">Create new business type</div>
                <p className="text-xs text-success/80">
                  Key is unique. Defaults: name & sellPrice required; others optional.
                </p>
              </div>
            </div>
            <form action={onStructuredEdit} onSubmit={handleOfflineStructuredEdit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  name="key"
                  type="text"
                  className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="unique key (e.g., bakery)"
                  required
                />
                <input
                  name="label"
                  type="text"
                  className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Display label"
                />
                <label className="inline-flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" name="isActive" className="w-4 h-4" defaultChecked />
                  <span>Active</span>
                </label>
              </div>

              <div className="border border-border rounded-lg p-3 space-y-2 bg-card">
                <div className="text-sm font-semibold text-foreground">Fields</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {ALL_FIELDS.map((f) => (
                    <div
                      key={`create-${f}`}
                      className="border border-border rounded-md px-3 py-2 flex flex-col gap-1"
                    >
                      <div className="text-sm font-medium text-foreground">{f}</div>
                      <label className="inline-flex items-center gap-2 text-xs text-foreground">
                        <input
                          type="checkbox"
                          name={`req:${f}`}
                          className="w-4 h-4"
                          defaultChecked={f === "name" || f === "sellPrice"}
                        />
                        <span>Required</span>
                      </label>
                      <label className="inline-flex items-center gap-2 text-xs text-foreground">
                        <input type="checkbox" name={`hid:${f}`} className="w-4 h-4" />
                        <span>Hidden</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="border border-border rounded-lg p-3 space-y-2 bg-card">
                  <div className="text-sm font-semibold text-foreground">Stock</div>
                  <label className="inline-flex items-center gap-2 text-sm text-foreground">
                    <input type="checkbox" name="stock:enabledByDefault" className="w-4 h-4" />
                    <span>Enabled by default</span>
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-foreground">
                    <input type="checkbox" name="stock:requiredWhenEnabled" className="w-4 h-4" />
                    <span>Quantity required when enabled</span>
                  </label>
                </div>

                <div className="border border-border rounded-lg p-3 space-y-2 bg-card">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-foreground">Unit</div>
                    <label className="inline-flex items-center gap-2 text-sm text-foreground">
                      <input type="checkbox" name="unit:enabled" className="w-4 h-4" />
                      <span>Enable unit field</span>
                    </label>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Options (comma separated)</label>
                    <input
                      name="unitOptions"
                      type="text"
                      className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="pcs, kg, liter"
                    />
                    <label className="text-xs text-muted-foreground">Default unit</label>
                    <input
                      name="unitDefault"
                      type="text"
                      className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="pcs"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-primary-soft text-primary border border-primary/30 font-semibold hover:bg-primary/15 hover:border-primary/40"
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
              const usageInfo = usage[t.key] ?? { shopCount: 0, templateCount: 0 };
              const canDelete = usageInfo.shopCount === 0 && usageInfo.templateCount === 0;

              return (
                <div
                  key={t.key}
                  className="border border-border rounded-xl p-4 space-y-3 bg-card shadow-sm"
                >
                  <div className="flex flex-wrap items-center gap-3 justify-between">
                    <div>
                      <div className="text-sm text-muted-foreground font-mono">{t.key}</div>
                      <div className="text-lg font-semibold text-foreground">{t.label}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Shops: {usageInfo.shopCount} | Templates: {usageInfo.templateCount}
                      </div>
                    </div>
                    <form action={onToggleActive} onSubmit={handleOfflineToggleActive}>
                      <input type="hidden" name="key" value={t.key} />
                      <input type="hidden" name="isActive" value={(!t.isActive).toString()} />
                      <button
                        type="submit"
                        className={`px-3 py-2 text-sm rounded-md border ${
                          t.isActive
                            ? "border-danger/30 text-danger bg-danger-soft hover:border-danger/50"
                            : "border-success/30 text-success bg-success-soft hover:border-success/50"
                        }`}
                      >
                        {t.isActive ? "Disable" : "Enable"}
                      </button>
                    </form>
                  </div>

                  <form action={onStructuredEdit} onSubmit={handleOfflineStructuredEdit} className="space-y-3">
                    <input type="hidden" name="key" value={t.key} />

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input
                        name="label"
                        type="text"
                        className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="Label"
                        defaultValue={t.label}
                      />
                      <label className="inline-flex items-center gap-2 text-sm text-foreground">
                        <input type="checkbox" name="isActive" className="w-4 h-4" defaultChecked={t.isActive} />
                        <span>Active</span>
                      </label>
                      <div className="text-xs text-muted-foreground">
                        Save will validate and upsert this config.
                      </div>
                    </div>

                    <div className="border border-border rounded-lg p-3 space-y-2">
                      <div className="text-sm font-semibold text-foreground">Fields</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {ALL_FIELDS.map((f) => {
                          const rule = (fields as any)[f] || {};
                          return (
                            <div
                              key={f}
                              className="border border-border rounded-md px-3 py-2 flex flex-col gap-1"
                            >
                              <div className="text-sm font-medium text-foreground">{f}</div>
                              <label className="inline-flex items-center gap-2 text-xs text-foreground">
                                <input type="checkbox" name={`req:${f}`} className="w-4 h-4" defaultChecked={!!rule.required} />
                                <span>Required</span>
                              </label>
                              <label className="inline-flex items-center gap-2 text-xs text-foreground">
                                <input type="checkbox" name={`hid:${f}`} className="w-4 h-4" defaultChecked={!!rule.hidden} />
                                <span>Hidden</span>
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <div className="border border-border rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-foreground">Stock</div>
                        </div>
                        <label className="inline-flex items-center gap-2 text-sm text-foreground">
                          <input
                            type="checkbox"
                            name="stock:enabledByDefault"
                            className="w-4 h-4"
                            defaultChecked={!!stock.enabledByDefault}
                          />
                          <span>Enabled by default</span>
                        </label>
                        <label className="inline-flex items-center gap-2 text-sm text-foreground">
                          <input
                            type="checkbox"
                            name="stock:requiredWhenEnabled"
                            className="w-4 h-4"
                            defaultChecked={!!stock.requiredWhenEnabled}
                          />
                          <span>Quantity required when enabled</span>
                        </label>
                      </div>

                      <div className="border border-border rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-foreground">Unit</div>
                          <label className="inline-flex items-center gap-2 text-sm text-foreground">
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
                          <label className="text-xs text-muted-foreground">Options (comma separated)</label>
                          <input
                            name="unitOptions"
                            type="text"
                            className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                            placeholder="kg, gm, pcs"
                            defaultValue={unitOptions.join(", ")}
                          />
                          <label className="text-xs text-muted-foreground">Default unit</label>
                          <select
                            name="unitDefault"
                            className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                        data-offline-action="save"
                        className="px-4 py-2 rounded-md bg-primary-soft text-primary border border-primary/30 font-semibold hover:bg-primary/15 hover:border-primary/40"
                      >
                        Save changes
                      </button>
                      <button
                        type="submit"
                        formAction={onDeleteBusinessType}
                        data-offline-action="delete"
                        disabled={!canDelete}
                        className={`px-4 py-2 rounded-md border font-semibold ${
                          canDelete
                            ? "border-danger/30 text-danger bg-danger-soft hover:border-danger/50"
                            : "border-border text-muted-foreground bg-muted cursor-not-allowed"
                        }`}
                      >
                        Delete
                      </button>
                    </div>
                    {!canDelete && (
                      <p className="text-xs text-warning">
                        Delete is disabled because this business type is in use.
                      </p>
                    )}
                  </form>
                </div>
              );
            })}
          </div>
        </div>
      </fieldset>
    </div>
  );
}
