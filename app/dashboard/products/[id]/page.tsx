// app/dashboard/products/[id]/page.tsx

import { getProduct, updateProduct } from "@/app/actions/products";
import { redirect } from "next/navigation";

type EditProductPageProps = {
  params: {
    id: string;
  };
};

export default async function EditProductPage({
  params,
}: EditProductPageProps) {
  const product = await getProduct(params.id);

  if (!product) {
    return <div>Product not found.</div>;
  }

  const shopId = (product as any).shopId ?? ""; // schema অনুযায়ী shopId আছে

  async function handleUpdate(formData: FormData) {
    "use server";

    const name = formData.get("name") as string;
    const sellPrice = (formData.get("sellPrice") as string) || "0";
    const stockQty = (formData.get("stockQty") as string) || "0";
    const isActive = formData.get("isActive") === "on";

    await updateProduct(params.id, {
      name,
      sellPrice,
      stockQty,
      isActive,
    });

    redirect(`/dashboard/products?shopId=${shopId}`);
  }

  return (
    <form action={handleUpdate} className="space-y-4 max-w-lg">
      <h1 className="text-xl font-bold">Edit Product</h1>

      <input
        name="name"
        className="border p-2 w-full"
        defaultValue={(product as any).name}
        required
      />

      <input
        name="sellPrice"
        className="border p-2 w-full"
        type="number"
        step="0.01"
        min="0"
        defaultValue={(product as any).sellPrice}
        required
      />

      <input
        name="stockQty"
        className="border p-2 w-full"
        type="number"
        step="0.01"
        min="0"
        defaultValue={(product as any).stockQty ?? "0"}
      />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={Boolean((product as any).isActive)}
        />
        Active
      </label>

      <button className="px-4 py-2 bg-black text-white rounded">
        Update Product
      </button>
    </form>
  );
}
