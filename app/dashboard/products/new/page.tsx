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
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">নতুন পণ্য</h1>
        <p className="text-gray-600">প্রথমে একটি দোকান বাছাই করুন।</p>
      </div>
    );
  }
  const ensuredShopId = shopId;

  async function handleSubmit(e: any) {
    e.preventDefault();
    const form = new FormData(e.target);

    const buyPriceRaw = form.get("buyPrice") as string;
    const buyPrice =
      buyPriceRaw && buyPriceRaw.toString().trim() !== ""
        ? (buyPriceRaw as string)
        : null;

    const payload: LocalProduct = {
      id: crypto.randomUUID(),
      shopId: ensuredShopId,
      name: form.get("name") as string,
      category:
        ((form.get("category") as string) || "Uncategorized").trim() ||
        "Uncategorized",
      buyPrice,
      sellPrice: form.get("sellPrice") as string,
      stockQty: form.get("stockQty") as string,
      isActive: form.get("isActive") === "on",
      updatedAt: Date.now(),
      syncStatus: "new",
    };

    if (online) {
      await createProduct(payload);
      alert("পণ্য সফলভাবে যোগ হয়েছে।");
    } else {
      await db.products.put(payload);
      await queueAdd("product", "create", payload);
      alert("পণ্য অফলাইনে সংরক্ষিত হয়েছে। এটি স্বয়ংক্রিয়ভাবে সিঙ্ক হবে।");
    }

    router.push(`/dashboard/products?shopId=${ensuredShopId}`);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">নতুন পণ্য যোগ করুন</h1>
        <p className="text-gray-600 mt-2">পণ্যের বিবরণ লিখুন এবং সংরক্ষণ করুন।</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-8 space-y-6">
        
        {/* Product Name */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">পণ্যের নাম *</label>
          <input
            name="name"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="যেমন: চাল, ডাল, তেল..."
            required
          />
          <p className="text-sm text-gray-500">পণ্যের সুস্পষ্ট নাম লিখুন।</p>
        </div>


        {/* Category */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">Category *</label>
          <input
            name="category"
            list="category-suggestions"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="e.g., Vegetables, Dairy, Snacks, Drinks"
            required
          />
          <datalist id="category-suggestions">
            <option value="Vegetables" />
            <option value="Fruits" />
            <option value="Dairy" />
            <option value="Rice & Staples" />
            <option value="Beverages" />
            <option value="Snacks" />
            <option value="Household" />
            <option value="Personal Care" />
          </datalist>
          <p className="text-sm text-gray-500">
            Product category is saved to the database so POS filters don't rely on guesses.
          </p>
        </div>

        {/* Sell Price */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">বিক্রয় মূল্য (৳) *</label>
          <input
            name="sellPrice"
            type="number"
            step="0.01"
            min="0"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="যেমন: 50, 100.50"
            required
          />
          <p className="text-sm text-gray-500">গ্রাহকদের কাছে যে দামে বিক্রি করবেন।</p>
        </div>

        {/* Advanced (optional) */}
        <details className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <summary className="cursor-pointer text-base font-semibold text-gray-900">
            Advanced (optional)
          </summary>
          <div className="mt-4 space-y-2">
            <label className="block text-base font-medium text-gray-900">Buy Price (optional)</label>
            <input
              name="buyPrice"
              type="number"
              step="0.01"
              min="0"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="e.g., 80.00"
            />
            <p className="text-sm text-gray-500">
              Not required now. Adding it later unlocks profit, stock value, and supplier reports.
            </p>
          </div>
        </details>

        {/* Initial Stock */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">প্রাথমিক স্টক</label>
          <input
            name="stockQty"
            type="number"
            step="0.01"
            min="0"
            defaultValue="0"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="যেমন: 10, 50"
          />
          <p className="text-sm text-gray-500">এখন কতটি পণ্য স্টকে আছে।</p>
        </div>

        {/* Active Status */}
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input 
              type="checkbox" 
              name="isActive" 
              defaultChecked
              className="w-5 h-5 border border-gray-300 rounded cursor-pointer"
            />
            <span className="text-base font-medium text-gray-900">এই পণ্য সক্রিয় রাখুন</span>
          </label>
          <p className="text-sm text-gray-500">অসক্রিয় পণ্য বিক্রয় তালিকায় দেখা যাবে না।</p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-4">
          <button 
            type="submit"
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg text-lg transition-colors"
          >
            ✓ পণ্য সংরক্ষণ করুন
          </button>
          <button 
            type="button"
            onClick={() => router.back()}
            className="flex-1 border border-gray-300 text-gray-900 font-medium py-4 px-6 rounded-lg text-lg hover:bg-gray-100 transition-colors"
          >
            বাতিল করুন
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NewProductPage() {
  return (
    <Suspense fallback={<div>Loading product form...</div>}>
      <ProductForm />
    </Suspense>
  );
}
