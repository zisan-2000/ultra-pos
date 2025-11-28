// app/dashboard/products/new/page.tsx

"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { queueAdd } from "@/lib/sync/queue";
import { db, type LocalProduct } from "@/lib/dexie/db";
import { createProduct } from "@/app/actions/products";
import { useRouter, useSearchParams } from "next/navigation";

function ProductForm() {
  const router = useRouter();
  const params = useSearchParams();
  const online = useOnlineStatus();

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
  const [selectedCategory, setSelectedCategory] = useState("অশ্রেণীবদ্ধ");
  const [unitOptions, setUnitOptions] = useState<string[]>(presetUnits);
  const [selectedUnit, setSelectedUnit] = useState("pcs");

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

  useEffect(() => {
    if (!ensuredShopId) return;
    try {
      const stored = localStorage.getItem(`customCategories:${ensuredShopId}`);
      const parsed = stored ? (JSON.parse(stored) as string[]) : [];
      const custom = Array.isArray(parsed) ? parsed : [];
      const merged = Array.from(new Set([...presetCategories, ...custom]));
      setCategoryOptions(merged);
      setSelectedCategory((prev) => (merged.includes(prev) ? prev : "অশ্রেণীবদ্ধ"));
    } catch (err) {
      console.error("Failed to load custom categories", err);
      setCategoryOptions(presetCategories);
      setSelectedCategory("অশ্রেণীবদ্ধ");
    }
  }, [ensuredShopId, presetCategories]);

  useEffect(() => {
    if (!ensuredShopId) return;
    try {
      const stored = localStorage.getItem(`customUnits:${ensuredShopId}`);
      const parsed = stored ? (JSON.parse(stored) as string[]) : [];
      const custom = Array.isArray(parsed) ? parsed : [];
      const merged = Array.from(new Set([...presetUnits, ...custom]));
      setUnitOptions(merged);
      setSelectedUnit((prev) => (merged.includes(prev) ? prev : "pcs"));
    } catch (err) {
      console.error("Failed to load custom units", err);
      setUnitOptions(presetUnits);
      setSelectedUnit("pcs");
    }
  }, [ensuredShopId, presetUnits]);

  function handleAddCustomCategory() {
    const input = prompt("Enter custom category name");
    if (!input) return;
    const value = input.toString().trim();
    if (!value) return;

    const merged = Array.from(new Set([...categoryOptions, value]));
    setCategoryOptions(merged);
    setSelectedCategory(value);

    const customOnly = merged.filter((c) => !presetCategories.includes(c));
    localStorage.setItem(`customCategories:${ensuredShopId}`, JSON.stringify(customOnly));
  }

  function handleAddCustomUnit() {
    const input = prompt("Enter custom unit name");
    if (!input) return;
    const value = input.toString().trim().toLowerCase();
    if (!value) return;

    const merged = Array.from(new Set([...unitOptions, value]));
    setUnitOptions(merged);
    setSelectedUnit(value);

    // store only custom units (non-preset) for this shop
    const customOnly = merged.filter((u) => !presetUnits.includes(u));
    localStorage.setItem(`customUnits:${ensuredShopId}`, JSON.stringify(customOnly));
  }

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
      category: selectedCategory || "অশ্রেণীবদ্ধ",
      baseUnit: selectedUnit,
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
          <p className="text-sm text-gray-500">পণ্যের সঠিক নাম লিখুন</p>
        </div>

        {/* Sell Price */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">বিক্রয় মূল্য (৳) *</label>
          <input
            name="sellPrice"
            type="number"
            step="0.01"
            min="0"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="যেমন: ৫০, ১০০.৫০"
            required
          />
          <p className="text-sm text-gray-500">ক্রেতার কাছে বিক্রির মূল্য</p>
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
            দ্রুত ইনপুটের জন্য ডিফল্ট অশ্রেণীবদ্ধ থাকবে। প্রয়োজন হলে দোকানভিত্তিক ক্যাটেগরি যোগ করুন।
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
            দ্রুত এন্ট্রির জন্য ডিফল্ট pcs রাখা হয়েছে। প্রয়োজন হলে কাস্টম ইউনিট যোগ করুন।
          </p>
        </div>

        {/* Initial Stock */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">প্রারম্ভিক স্টক</label>
          <input
            name="stockQty"
            type="number"
            step="0.01"
            min="0"
            defaultValue="0"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="যেমন: ১০, ৫০"
          />
          <p className="text-sm text-gray-500">মজুদের বর্তমান পরিমাণ</p>
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
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="যেমন: ৮০.০০"
            />
            <p className="text-sm text-gray-500">
              এখন না দিলেও হবে; পরে যোগ করলে লাভ, স্টক ভ্যালু ইত্যাদি হিসাব করা যাবে।
            </p>
          </div>
        </details>

        {/* Active Status */}
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input 
              type="checkbox" 
              name="isActive" 
              defaultChecked
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
