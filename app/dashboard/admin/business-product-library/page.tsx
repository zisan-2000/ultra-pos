// app/dashboard/admin/business-product-library/page.tsx

import {
  createBusinessProductTemplate,
  deleteBusinessProductTemplate,
  listBusinessProductTemplatesAdmin,
  updateBusinessProductTemplate,
} from "@/app/actions/business-product-templates";
import { listBusinessTypes } from "@/app/actions/business-types";
import { businessOptions } from "@/lib/productFormConfig";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function handleCreateTemplate(formData: FormData) {
  "use server";
  const businessType = (formData.get("businessType") as string | null) || "";
  const name = (formData.get("name") as string | null) || "";
  const category = (formData.get("category") as string | null) || null;
  const defaultSellPrice = formData.get("defaultSellPrice") as string | null;
  const isActive = formData.get("isActive") === "on";

  await createBusinessProductTemplate({
    businessType,
    name,
    category,
    defaultSellPrice,
    isActive,
  });
  revalidatePath("/dashboard/admin/business-product-library");
}

async function handleUpdateTemplate(formData: FormData) {
  "use server";
  const id = (formData.get("id") as string | null) || "";
  const name = formData.get("name") as string | null;
  const category = formData.get("category") as string | null;
  const defaultSellPrice = formData.get("defaultSellPrice") as string | null;
  const isActive = formData.get("isActive") === "on";

  await updateBusinessProductTemplate(id, {
    name: name ?? undefined,
    category: category ?? undefined,
    defaultSellPrice: defaultSellPrice ?? undefined,
    isActive,
  });
  revalidatePath("/dashboard/admin/business-product-library");
}

async function handleDeleteTemplate(formData: FormData) {
  "use server";
  const id = (formData.get("id") as string | null) || "";
  await deleteBusinessProductTemplate(id);
  revalidatePath("/dashboard/admin/business-product-library");
}

export default async function BusinessProductLibraryPage() {
  let templates: Awaited<ReturnType<typeof listBusinessProductTemplatesAdmin>> = [];
  let error: string | null = null;

  try {
    templates = await listBusinessProductTemplatesAdmin();
  } catch (err: any) {
    error = err?.message || "Unable to load templates (Super Admin only).";
  }

  let businessTypes: Awaited<ReturnType<typeof listBusinessTypes>> = [];
  try {
    businessTypes = await listBusinessTypes();
  } catch {
    businessTypes = [];
  }

  const mergedBusinessTypes = [
    ...businessTypes.map((t) => ({ id: t.key, label: t.label })),
    ...businessOptions.filter((opt) => !businessTypes.some((t) => t.key === opt.id)),
  ];

  const labelMap = new Map(
    mergedBusinessTypes.map((opt) => [opt.id, opt.label] as const),
  );

  const grouped = templates.reduce<Record<string, typeof templates>>((acc, template) => {
    const key = template.businessType;
    if (!acc[key]) acc[key] = [];
    acc[key].push(template);
    return acc;
  }, {});

  return (
    <div className="max-w-5xl mx-auto space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Business Product Library</h1>
        <p className="text-muted-foreground">
          Super Admin can manage default products for each business type. These power quick add in
          the product list.
        </p>
      </div>

      {error ? (
        <div className="border border-danger/30 bg-danger-soft text-danger rounded-lg p-4">
          {error}
        </div>
      ) : null}

      <div className="border border-border rounded-xl p-4 space-y-3 bg-card">
        <h2 className="text-lg font-semibold text-foreground">Add new template</h2>
        <form action={handleCreateTemplate} className="grid grid-cols-1 lg:grid-cols-5 gap-3">
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
                    <form action={handleUpdateTemplate} className="grid grid-cols-1 lg:grid-cols-6 gap-3 lg:col-span-5">
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
                    <form action={handleDeleteTemplate} className="lg:col-span-1 flex justify-end">
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
    </div>
  );
}
