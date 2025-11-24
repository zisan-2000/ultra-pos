"use client";

import { useOnlineStatus } from "@/lib/sync/net-status";
import { queueAdd } from "@/lib/sync/queue";
import { db } from "@/lib/dexie/db";
import { updateProduct } from "@/app/actions/products";
import { useRouter } from "next/navigation";

export default function EditProductClient({ product }: any) {
  const online = useOnlineStatus();
  const router = useRouter();

  const shopId = product.shopId;

  async function handleSubmit(e: any) {
    e.preventDefault();

    const form = new FormData(e.target);

    const updatePayload = {
      ...product,
      name: form.get("name") as string,
      sellPrice: form.get("sellPrice") as string,
      stockQty: form.get("stockQty") as string,
      isActive: form.get("isActive") === "on",
      updatedAt: Date.now(),
      syncStatus: "updated",
    };

    if (online) {
      await updateProduct(product.id, updatePayload);
    } else {
      await db.products.put(updatePayload);
      await queueAdd("product", "update", updatePayload);
      alert("Updated offline. Will sync later.");
    }

    router.push(`/dashboard/products?shopId=${shopId}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <h1 className="text-xl font-bold">Edit Product</h1>

      <input
        name="name"
        defaultValue={product.name}
        className="border p-2 w-full"
        required
      />

      <input
        name="sellPrice"
        type="number"
        step="0.01"
        min="0"
        defaultValue={product.sellPrice}
        className="border p-2 w-full"
        required
      />

      <input
        name="stockQty"
        type="number"
        step="0.01"
        min="0"
        defaultValue={product.stockQty}
        className="border p-2 w-full"
      />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={product.isActive}
        />
        Active
      </label>

      <button className="px-4 py-2 bg-black text-white rounded">
        Update Product
      </button>
    </form>
  );
}
