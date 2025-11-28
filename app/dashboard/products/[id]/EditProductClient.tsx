"use client";

import { useEffect, useMemo, useState } from "react";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { queueAdd } from "@/lib/sync/queue";
import { db } from "@/lib/dexie/db";
import { updateProduct } from "@/app/actions/products";
import { useRouter } from "next/navigation";

export default function EditProductClient({ product }: any) {
  const online = useOnlineStatus();
  const router = useRouter();

  const shopId = product.shopId;
  const presetUnits = useMemo(
    () => ["pcs", "packet", "box", "dozen", "kg", "gm", "liter", "ml", "ft", "plate", "cup"],
    []
  );
  const [unitOptions, setUnitOptions] = useState<string[]>(presetUnits);
  const [selectedUnit, setSelectedUnit] = useState(
    (product.baseUnit as string) || "pcs"
  );

  useEffect(() => {
    if (!shopId) return;
    try {
      const stored = localStorage.getItem(`customUnits:${shopId}`);
      const parsed = stored ? (JSON.parse(stored) as string[]) : [];
      const custom = Array.isArray(parsed) ? parsed : [];
      const merged = Array.from(new Set([...presetUnits, ...custom, selectedUnit]));
      setUnitOptions(merged);
      setSelectedUnit((prev) => (merged.includes(prev) ? prev : "pcs"));
    } catch (err) {
      console.error("Failed to load custom units", err);
      setUnitOptions(presetUnits);
      setSelectedUnit("pcs");
    }
  }, [shopId, presetUnits, selectedUnit]);

  function handleAddCustomUnit() {
    const input = prompt("Enter custom unit name");
    if (!input) return;
    const value = input.toString().trim().toLowerCase();
    if (!value) return;

    const merged = Array.from(new Set([...unitOptions, value]));
    setUnitOptions(merged);
    setSelectedUnit(value);

    const customOnly = merged.filter((u) => !presetUnits.includes(u));
    localStorage.setItem(`customUnits:${shopId}`, JSON.stringify(customOnly));
  }

  async function handleSubmit(e: any) {
    e.preventDefault();

    const form = new FormData(e.target);

    const buyPriceRaw = form.get("buyPrice") as string;
    const buyPrice =
      buyPriceRaw && buyPriceRaw.toString().trim() !== ""
        ? (buyPriceRaw as string)
        : null;

    const updatePayload = {
      ...product,
      name: form.get("name") as string,
      baseUnit: selectedUnit,
      buyPrice,
      sellPrice: form.get("sellPrice") as string,
      stockQty: form.get("stockQty") as string,
      isActive: form.get("isActive") === "on",
      updatedAt: Date.now(),
      syncStatus: "updated",
    };

    if (online) {
      await updateProduct(product.id, updatePayload);
      alert("পণ্য সফলভাবে আপডেট হয়েছে।");
    } else {
      await db.products.put(updatePayload);
      await queueAdd("product", "update", updatePayload);
      alert("পণ্য অফলাইনে আপডেট হয়েছে। এটি পরে সিঙ্ক হবে।");
    }

    router.push(`/dashboard/products?shopId=${shopId}`);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">পণ্য সম্পাদনা করুন</h1>
        <p className="text-gray-600 mt-2">পণ্যের তথ্য পরিবর্তন করুন এবং সংরক্ষণ করুন।</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-8 space-y-6">
        
        {/* Product Name */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">পণ্যের নাম *</label>
          <input
            name="name"
            defaultValue={product.name}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="যেমন: চাল, ডাল, তেল..."
            required
          />
          <p className="text-sm text-gray-500">পণ্যের সুস্পষ্ট নাম লিখুন।</p>
        </div>

        {/* Unit (optional, default pcs) */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">Unit (optional)</label>
          <div className="flex gap-3">
            <select
              name="baseUnit"
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {unitOptions.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAddCustomUnit}
              className="shrink-0 px-4 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-900 hover:bg-gray-100 transition-colors"
            >
              + Add custom
            </button>
          </div>
          <p className="text-sm text-gray-500">
            Default stays pcs; change only if you sell in weight/volume or other units.
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
            defaultValue={product.sellPrice}
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
              defaultValue={product.buyPrice ?? ""}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="e.g., 80.00"
            />
            <p className="text-sm text-gray-500">
              Keep empty if you don't track it. Filling later unlocks profit and purchase insights.
            </p>
          </div>
        </details>

        {/* Stock Quantity */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">বর্তমান স্টক</label>
          <input
            name="stockQty"
            type="number"
            step="0.01"
            min="0"
            defaultValue={product.stockQty}
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
              defaultChecked={product.isActive}
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
            ✓ পরিবর্তন সংরক্ষণ করুন
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
