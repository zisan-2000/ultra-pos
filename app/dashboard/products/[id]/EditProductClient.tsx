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
  const presetCategories = useMemo(
    () => [
      "অশ্রেণীবদ্ধ",
      "Uncategorized",
      "মুদিখানা",
      "পানীয়",
      "নাস্তা",
      "পার্সোনাল কেয়ার",
      "গৃহস্থালী",
      "ইলেকট্রনিক্স",
      "হার্ডওয়্যার",
      "স্টেশনারি",
      "ফাস্টফুড",
      "ফার্মেসি",
      "পোশাক",
    ],
    []
  );
  const presetUnits = useMemo(
    () => ["pcs", "packet", "box", "dozen", "kg", "gm", "liter", "ml", "ft", "plate", "cup"],
    []
  );
  const unitLabels = useMemo(
    () => ({
      pcs: "pcs (ডিফল্ট)",
      packet: "packet",
      box: "box",
      dozen: "dozen",
      kg: "kg (কেজি)",
      gm: "gm (গ্রাম)",
      liter: "liter (লিটার)",
      ml: "ml (মিলি)",
      ft: "ft (ফুট)",
      plate: "plate (প্লেট)",
      cup: "cup (কাপ)",
    }),
    []
  );
  const [categoryOptions, setCategoryOptions] = useState<string[]>(presetCategories);
  const [selectedCategory, setSelectedCategory] = useState(
    (product.category as string) || "অশ্রেণীবদ্ধ"
  );
  const [unitOptions, setUnitOptions] = useState<string[]>(presetUnits);
  const [selectedUnit, setSelectedUnit] = useState(
    (product.baseUnit as string) || "pcs"
  );

  useEffect(() => {
    if (!shopId) return;
    try {
      const stored = localStorage.getItem(`customCategories:${shopId}`);
      const parsed = stored ? (JSON.parse(stored) as string[]) : [];
      const custom = Array.isArray(parsed) ? parsed : [];
      const merged = Array.from(new Set([...presetCategories, ...custom, selectedCategory]));
      setCategoryOptions(merged);
      setSelectedCategory((prev) => (merged.includes(prev) ? prev : "অশ্রেণীবদ্ধ"));
    } catch (err) {
      console.error("Failed to load custom categories", err);
      setCategoryOptions(presetCategories);
      setSelectedCategory("অশ্রেণীবদ্ধ");
    }
  }, [shopId, presetCategories, selectedCategory]);

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

  function handleAddCustomCategory() {
    const input = prompt("Enter custom category name");
    if (!input) return;
    const value = input.toString().trim();
    if (!value) return;

    const merged = Array.from(new Set([...categoryOptions, value]));
    setCategoryOptions(merged);
    setSelectedCategory(value);

    const customOnly = merged.filter((c) => !presetCategories.includes(c));
    localStorage.setItem(`customCategories:${shopId}`, JSON.stringify(customOnly));
  }

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
      category: selectedCategory || "অশ্রেণীবদ্ধ",
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
        <p className="text-gray-600 mt-2">পণ্যের তথ্য প্রয়োজনমতো আপডেট করুন</p>
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
          <p className="text-sm text-gray-500">পণ্যের সঠিক নাম লিখুন</p>
        </div>

        {/* Category (optional with custom) */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">ক্যাটেগরি (ঐচ্ছিক)</label>
          <div className="flex gap-3">
            <select
              name="category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAddCustomCategory}
              className="shrink-0 px-4 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-900 hover:bg-gray-100 transition-colors"
            >
              + কাস্টম যোগ করুন
            </button>
          </div>
          <p className="text-sm text-gray-500">
            ডিফল্ট অশ্রেণীবদ্ধ; প্রয়োজনে দোকানের নিজস্ব ক্যাটেগরি দিন।
          </p>
        </div>

        {/* Unit (optional, default pcs) */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">ইউনিট (ঐচ্ছিক)</label>
          <div className="flex gap-3">
            <select
              name="baseUnit"
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {unitOptions.map((u) => (
                <option key={u} value={u}>
                  {unitLabels[u] || u}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAddCustomUnit}
              className="shrink-0 px-4 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-900 hover:bg-gray-100 transition-colors"
            >
              + কাস্টম যোগ করুন
            </button>
          </div>
          <p className="text-sm text-gray-500">
            ডিফল্ট pcs; ওজন/আয়তন বা অন্য ইউনিটে বিক্রি করলে পরিবর্তন করুন।
          </p>
        </div>

        {/* Sell Price */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">বিক্রয় মূল্য (৳) *</label>
          <input
            name="sellPrice"
            type="number"
            step="0.01"
            min="0"
            defaultValue={product.sellPrice}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="যেমন: ৫০, ১০০.৫০"
            required
          />
          <p className="text-sm text-gray-500">ক্রেতার কাছে বিক্রির মূল্য</p>
        </div>

        {/* Advanced (optional) */}
        <details className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <summary className="cursor-pointer text-base font-semibold text-gray-900">
            অ্যাডভান্সড (ঐচ্ছিক)
          </summary>
          <div className="mt-4 space-y-2">
            <label className="block text-base font-medium text-gray-900">ক্রয় মূল্য (ঐচ্ছিক)</label>
            <input
              name="buyPrice"
              type="number"
              step="0.01"
              min="0"
              defaultValue={product.buyPrice ?? ""}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="যেমন: ৮০.০০"
            />
            <p className="text-sm text-gray-500">
              চাইলে এখানে দিন; পরে যোগ করলে লাভ ও স্টক ভ্যালু ট্র্যাক করতে সুবিধা হবে।
            </p>
          </div>
        </details>

        {/* Stock Quantity */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">স্টক পরিমাণ</label>
          <input
            name="stockQty"
            type="number"
            step="0.01"
            min="0"
            defaultValue={product.stockQty}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="যেমন: ১০, ৫০"
          />
          <p className="text-sm text-gray-500">বর্তমান মজুদ লিখুন</p>
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
            <span className="text-base font-medium text-gray-900">এই পণ্য সক্রিয় রাখুন</span>
          </label>
          <p className="text-sm text-gray-500">সক্রিয় পণ্য বিক্রয় তালিকায় দেখা যাবে।</p>
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
