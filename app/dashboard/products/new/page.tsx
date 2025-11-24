// app/dashboard/products/new/page.tsx

import { createProduct } from "@/app/actions/products";
import { redirect } from "next/navigation";

type NewProductPageProps = {
  searchParams?: {
    shopId?: string;
  };
};

export default function NewProductPage({ searchParams }: NewProductPageProps) {
  const shopId = searchParams?.shopId;

  if (!shopId) {
    return (
      <div>
        <h1 className="text-xl font-bold mb-4">Create Product</h1>
        <p>You must select a shop first.</p>
      </div>
    );
  }

  async function handleSubmit(formData: FormData) {
    "use server";

    const name = formData.get("name") as string;
    const sellPrice = (formData.get("sellPrice") as string) || "0";
    const stockQty = (formData.get("stockQty") as string) || "0";
    const isActive = formData.get("isActive") === "on";

    await createProduct({
      shopId,
      name,
      sellPrice,
      stockQty,
      isActive,
    });

    redirect(`/dashboard/products?shopId=${shopId}`);
  }

  return (
    <form action={handleSubmit} className="space-y-4 max-w-lg">
      <h1 className="text-xl font-bold">Create Product</h1>

      <input
        name="name"
        className="border p-2 w-full"
        placeholder="Product name"
        required
      />

      <input
        name="sellPrice"
        className="border p-2 w-full"
        placeholder="Sell price"
        type="number"
        step="0.01"
        min="0"
        required
      />

      <input
        name="stockQty"
        className="border p-2 w-full"
        placeholder="Initial stock quantity"
        type="number"
        step="0.01"
        min="0"
        defaultValue="0"
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
