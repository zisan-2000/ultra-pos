// app/dashboard/admin/business-product-library/BusinessProductLibraryClient.tsx

"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useSyncStatus } from "@/lib/sync/sync-status";
import { queueAdminAction } from "@/lib/sync/queue";
import { businessOptions } from "@/lib/productFormConfig";

type BusinessTypeRow = { key: string; label: string };

type TemplateRow = {
  id: string;
  businessType: string;
  name: string;
  category?: string | null;
  defaultSellPrice?: string | number | null;
  isActive: boolean;
};

type Props = {
  initialTemplates: TemplateRow[];
  initialBusinessTypes: BusinessTypeRow[];
  error?: string | null;
  onCreateTemplate: (formData: FormData) => void | Promise<void>;
  onUpdateTemplate: (formData: FormData) => void | Promise<void>;
  onDeleteTemplate: (formData: FormData) => void | Promise<void>;
};

export default function BusinessProductLibraryClient({
  initialTemplates,
  initialBusinessTypes,
  error,
  onCreateTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
}: Props) {
  const online = useOnlineStatus();
  const router = useRouter();
  const { pendingCount, syncing, lastSyncAt } = useSyncStatus();
  const [templates, setTemplates] = useState<TemplateRow[]>(initialTemplates || []);
  const [businessTypes, setBusinessTypes] = useState<BusinessTypeRow[]>(
    initialBusinessTypes || []
  );
  const refreshInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const REFRESH_MIN_INTERVAL_MS = 15_000;
  const serverSnapshotRef = useRef({
    templates: initialTemplates,
    businessTypes: initialBusinessTypes,
  });

  const templatesKey = "admin:product-library:templates";
  const typesKey = "admin:product-library:types";

  const updateTemplates = useCallback(
    (updater: (prev: TemplateRow[]) => TemplateRow[]) => {
      setTemplates((prev) => {
        const next = updater(prev);
        try {
          localStorage.setItem(templatesKey, JSON.stringify(next));
        } catch {
          // ignore cache errors
        }
        return next;
      });
    },
    [templatesKey],
  );

  const handleOfflineCreate = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      if (online) return;
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const businessType = (formData.get("businessType") as string | null)?.trim();
      const name = (formData.get("name") as string | null)?.trim();
      if (!businessType || !name) return;
      const category = (formData.get("category") as string | null)?.trim() || null;
      const rawPrice = (formData.get("defaultSellPrice") as string | null)?.trim();
      const defaultSellPrice = rawPrice ? rawPrice : null;
      const isActive = formData.get("isActive") === "on";
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${businessType}-${Date.now()}`;

      updateTemplates((prev) => [
        ...prev,
        {
          id,
          businessType,
          name,
          category,
          defaultSellPrice,
          isActive,
        },
      ]);

      await queueAdminAction("business_template_create", {
        id,
        businessType,
        name,
        category,
        defaultSellPrice,
        isActive,
      });
      alert("Offline: template queued.");
      event.currentTarget.reset();
    },
    [online, updateTemplates],
  );

  const handleOfflineUpdate = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      if (online) return;
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const id = (formData.get("id") as string | null)?.trim();
      if (!id) return;
      const businessType = (formData.get("businessType") as string | null)?.trim();
      const name = (formData.get("name") as string | null)?.trim();
      const category = (formData.get("category") as string | null)?.trim() || null;
      const rawPrice = (formData.get("defaultSellPrice") as string | null)?.trim();
      const defaultSellPrice = rawPrice ? rawPrice : null;
      const isActive = formData.get("isActive") === "on";

      updateTemplates((prev) =>
        prev.map((template) =>
          template.id === id
            ? {
                ...template,
                businessType: businessType || template.businessType,
                name: name || template.name,
                category,
                defaultSellPrice,
                isActive,
              }
            : template,
        ),
      );

      await queueAdminAction("business_template_update", {
        id,
        businessType,
        name,
        category,
        defaultSellPrice,
        isActive,
      });
      alert("Offline: template update queued.");
    },
    [online, updateTemplates],
  );

  const handleOfflineDelete = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      if (online) return;
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const id = (formData.get("id") as string | null)?.trim();
      if (!id) return;
      updateTemplates((prev) => prev.filter((template) => template.id !== id));
      await queueAdminAction("business_template_delete", { id });
      alert("Offline: delete queued.");
    },
    [online, updateTemplates],
  );

  useEffect(() => {
    if (online) {
      if (Array.isArray(initialTemplates) && initialTemplates.length > 0) {
        setTemplates(initialTemplates);
        try {
          localStorage.setItem(templatesKey, JSON.stringify(initialTemplates));
        } catch {
          // ignore cache errors
        }
      } else if (error) {
        try {
          const raw = localStorage.getItem(templatesKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              setTemplates(parsed);
            }
          }
        } catch {
          // ignore cache errors
        }
      }

      if (Array.isArray(initialBusinessTypes) && initialBusinessTypes.length > 0) {
        setBusinessTypes(initialBusinessTypes);
        try {
          localStorage.setItem(typesKey, JSON.stringify(initialBusinessTypes));
        } catch {
          // ignore cache errors
        }
      }
      return;
    }

    try {
      const raw = localStorage.getItem(templatesKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setTemplates(parsed);
        }
      }
    } catch {
      // ignore cache errors
    }

    try {
      const raw = localStorage.getItem(typesKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setBusinessTypes(parsed);
        }
      }
    } catch {
      // ignore cache errors
    }
  }, [online, initialTemplates, initialBusinessTypes, error]);

  useEffect(() => {
    if (
      serverSnapshotRef.current.templates !== initialTemplates ||
      serverSnapshotRef.current.businessTypes !== initialBusinessTypes
    ) {
      serverSnapshotRef.current = {
        templates: initialTemplates,
        businessTypes: initialBusinessTypes,
      };
      refreshInFlightRef.current = false;
    }
  }, [initialTemplates, initialBusinessTypes]);

  useEffect(() => {
    if (!online || !lastSyncAt || syncing || pendingCount > 0) return;
    if (refreshInFlightRef.current) return;
    const now = Date.now();
    if (now - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) return;
    lastRefreshAtRef.current = now;
    refreshInFlightRef.current = true;
    router.refresh();
  }, [online, lastSyncAt, syncing, pendingCount, router]);

  const mergedBusinessTypes = useMemo(() => {
    return [
      ...businessTypes.map((t) => ({ id: t.key, label: t.label })),
      ...businessOptions.filter((opt) => !businessTypes.some((t) => t.key === opt.id)),
    ];
  }, [businessTypes]);

  const labelMap = useMemo(
    () => new Map(mergedBusinessTypes.map((opt) => [opt.id, opt.label] as const)),
    [mergedBusinessTypes]
  );

  const grouped = useMemo(() => {
    return templates.reduce<Record<string, TemplateRow[]>>((acc, template) => {
      const key = template.businessType;
      if (!acc[key]) acc[key] = [];
      acc[key].push(template);
      return acc;
    }, {});
  }, [templates]);

  const showError = online && error;
  const showOfflineEmpty = !online && templates.length === 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6 py-6">
      {!online && (
        <div className="border border-warning/30 bg-warning-soft text-warning rounded-lg p-3 text-xs font-semibold">
          অফলাইন: আগের Business Product Library ডাটা দেখানো হচ্ছে।
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-foreground">Business Product Library</h1>
        <p className="text-muted-foreground">
          Super Admin can manage default products for each business type. These power quick add in
          the product list.
        </p>
      </div>

      {showError ? (
        <div className="border border-danger/30 bg-danger-soft text-danger rounded-lg p-4">
          {error}
        </div>
      ) : null}

      {showOfflineEmpty ? (
        <div className="border border-border rounded-lg p-4 text-sm text-muted-foreground">
          Offline: cached templates not available.
        </div>
      ) : null}

      <fieldset className="space-y-6">
        <div className="border border-border rounded-xl p-4 space-y-3 bg-card">
          <h2 className="text-lg font-semibold text-foreground">Add new template</h2>
          <form
            action={onCreateTemplate}
            onSubmit={handleOfflineCreate}
            className="grid grid-cols-1 lg:grid-cols-5 gap-3"
          >
            <select
              name="businessType"
              required
              className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              defaultValue=""
            >
              <option value="" disabled>
                Business type
              </option>
              {mergedBusinessTypes.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label} ({opt.id})
                </option>
              ))}
            </select>
            <input
              name="name"
              type="text"
              required
              className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Product name"
            />
            <input
              name="category"
              type="text"
              className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Category (optional)"
            />
            <input
              name="defaultSellPrice"
              type="number"
              step="0.01"
              min="0"
              className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Default sell price"
            />
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" name="isActive" className="w-4 h-4" defaultChecked />
                <span>Active</span>
              </label>
              <button
                type="submit"
                className="ml-auto px-4 py-2 rounded-md bg-primary-soft text-primary border border-primary/30 font-semibold hover:bg-primary/15 hover:border-primary/40"
              >
                Add
              </button>
            </div>
          </form>
        </div>

        {templates.length === 0 ? (
          <div className="border border-border rounded-xl p-4 text-sm text-muted-foreground">
            No templates yet. Add a few above to enable quick add for shops.
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([businessType, items]) => (
              <div key={businessType} className="border border-border rounded-xl p-4 bg-card space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground font-mono">{businessType}</div>
                    <div className="text-lg font-semibold text-foreground">
                      {labelMap.get(businessType) || businessType}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{items.length} templates</span>
                </div>

                <div className="space-y-3">
                  {items.map((template) => (
                    <div
                      key={template.id}
                      className="border border-border rounded-lg p-3 grid grid-cols-1 lg:grid-cols-6 gap-3 items-start"
                    >
                      <form
                        action={onUpdateTemplate}
                        onSubmit={handleOfflineUpdate}
                        className="grid grid-cols-1 lg:grid-cols-6 gap-3 lg:col-span-5"
                      >
                        <input type="hidden" name="id" value={template.id} />
                        <input
                          name="name"
                          type="text"
                          className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          defaultValue={template.name}
                        />
                        <input
                          name="category"
                          type="text"
                          className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          defaultValue={template.category ?? ""}
                          placeholder="Category"
                        />
                        <input
                          name="defaultSellPrice"
                          type="number"
                          step="0.01"
                          min="0"
                          className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          defaultValue={template.defaultSellPrice ?? ""}
                          placeholder="Default price"
                        />
                        <label className="inline-flex items-center gap-2 text-sm text-foreground">
                          <input type="checkbox" name="isActive" className="w-4 h-4" defaultChecked={template.isActive} />
                          <span>Active</span>
                        </label>
                        <button
                          type="submit"
                          className="px-3 py-2 rounded-md bg-primary-soft text-primary border border-primary/30 font-semibold hover:bg-primary/15 hover:border-primary/40"
                        >
                          Save
                        </button>
                      </form>
                      <form
                        action={onDeleteTemplate}
                        onSubmit={handleOfflineDelete}
                        className="lg:col-span-1 flex justify-end"
                      >
                        <input type="hidden" name="id" value={template.id} />
                        <button
                          type="submit"
                          className="px-3 py-2 rounded-md bg-danger-soft text-danger border border-danger/30 font-semibold hover:bg-danger/10 hover:border-danger/40"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </fieldset>
    </div>
  );
}
