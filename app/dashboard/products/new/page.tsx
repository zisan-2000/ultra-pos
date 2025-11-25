// app/dashboard/products/new/page.tsx

"use client";

import { Suspense } from "react";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { queueAdd } from "@/lib/sync/queue";
import { db, type LocalProduct } from "@/lib/dexie/db";
import { createProduct } from "@/app/actions/products";
import { useRouter, useSearchParams } from "next/navigation";

function ProductForm() {
  const router = useRouter();
  const params = useSearchParams();
  const online = useOnlineStatus();

  const shopId = params.get("shopId");

  if (!shopId) {
    return (
      <div>
        <h1 className="text-xl font-bold mb-4">Create Product</h1>
        <p>You must select a shop first.</p>
      </div>
    );
  }
  const ensuredShopId = shopId;

  async function handleSubmit(e: any) {
    e.preventDefault();
    const form = new FormData(e.target);

    const payload: LocalProduct = {
      id: crypto.randomUUID(),
      shopId: ensuredShopId,
      name: form.get("name") as string,
      sellPrice: form.get("sellPrice") as string,
      stockQty: form.get("stockQty") as string,
      isActive: form.get("isActive") === "on",
      updatedAt: Date.now(),
      syncStatus: "new",
    };

    if (online) {
      await createProduct(payload);
    } else {
      await db.products.put(payload);
      await queueAdd("product", "create", payload);
      alert("Product saved offline. It will sync automatically.");
    }

    router.push(`/dashboard/products?shopId=${ensuredShopId}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <h1 className="text-xl font-bold">Create Product</h1>

      <input
        name="name"
        className="border p-2 w-full"
        placeholder="Product Name"
        required
      />

      <input
        name="sellPrice"
        type="number"
        step="0.01"
        min="0"
        className="border p-2 w-full"
        placeholder="Sell Price"
        required
      />

      <input
        name="stockQty"
        type="number"
        step="0.01"
        min="0"
        defaultValue="0"
        className="border p-2 w-full"
        placeholder="Initial Stock"
      />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked />
        Active
      </label>

      <button className="px-4 py-2 bg-black text-white rounded">
        Save Product
      </button>
    </form>
  );
}

export default function NewProductPage() {
  return (
    <Suspense fallback={<div>Loading product form...</div>}>
      <ProductForm />
    </Suspense>
  );
}
