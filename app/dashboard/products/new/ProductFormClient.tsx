// app/dashboard/products/new/ProductFormClient.tsx

"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { queueAdd } from "@/lib/sync/queue";
import { db, type LocalProduct } from "@/lib/dexie/db";
import { createProduct } from "@/app/actions/products";
import { useRouter } from "next/navigation";
import { useProductFields } from "@/hooks/useProductFields";
import { type BusinessType } from "@/lib/productFormConfig";

type Props = {
  shop: { id: string; name: string; businessType?: string | null };
};

function ProductForm({ shop }: Props) {
  const router = useRouter();
  const online = useOnlineStatus();
  const businessType = (shop.businessType as BusinessType) || "tea_stall";

  const presetCategories = useMemo(
    () => [
      "চা/কফি",
      "পান ও সিগারেট",
      "রিচার্জ",
      "ফলমূল",
      "সবজি",
      "মুদি",
      "স্ন্যাকস/স্টেশনারি",
      "পোশাক",
      "কসমেটিকস/গিফট",
      "ফার্মেসি",
      "হোলসেল",
      "অন্যান্য",
      "Uncategorized",
    ],
    []
  );

  const { isFieldVisible, isFieldRequired, defaultStockOn, unitOptions: configUnits } =
    useProductFields(businessType);

  const unitLabels = useMemo(
    () => ({
      pcs: "পিস",
      packet: "প্যাকেট",
      box: "বক্স",
      dozen: "ডজন",
      kg: "কেজি",
      gm: "গ্রাম",
      liter: "লিটার",
      ml: "এমএল",
      ft: "ফুট",
    }),
    []
  );

  const [categoryOptions, setCategoryOptions] = useState<string[]>(presetCategories);
  const [selectedCategory, setSelectedCategory] = useState("অন্যান্য");
  const [unitOptions, setUnitOptions] = useState<string[]>(configUnits);
  const [selectedUnit, setSelectedUnit] = useState(configUnits[0] || "pcs");
  const [stockEnabled, setStockEnabled] = useState(defaultStockOn);

  const ensuredShopId = shop.id;

  // Reset stock/unit when business type changes
  useEffect(() => {
    setStockEnabled(defaultStockOn);
    setUnitOptions(configUnits);
    setSelectedUnit(configUnits[0] || "pcs");
  }, [businessType]);

  useEffect(() => {
    if (!ensuredShopId) return;
    try {
      const stored = localStorage.getItem(`customCategories:${ensuredShopId}`);
      const parsed = stored ? (JSON.parse(stored) as string[]) : [];
      const custom = Array.isArray(parsed) ? parsed : [];
      const merged = Array.from(new Set([...presetCategories, ...custom]));
      setCategoryOptions(merged);
      setSelectedCategory((prev) => (merged.includes(prev) ? prev : "অন্যান্য"));
    } catch (err) {
      console.error("Failed to load custom categories", err);
      setCategoryOptions(presetCategories);
      setSelectedCategory("অন্যান্য");
    }
  }, [ensuredShopId, presetCategories]);

  useEffect(() => {
    if (!ensuredShopId) return;
    try {
      const stored = localStorage.getItem(`customUnits:${ensuredShopId}`);
      const parsed = stored ? (JSON.parse(stored) as string[]) : [];
      const custom = Array.isArray(parsed) ? parsed : [];
      const merged = Array.from(new Set([...configUnits, ...custom]));
      setUnitOptions(merged);
      setSelectedUnit((prev) => (merged.includes(prev) ? prev : merged[0] || "pcs"));
    } catch (err) {
      console.error("Failed to load custom units", err);
      setUnitOptions(configUnits);
      setSelectedUnit(configUnits[0] || "pcs");
    }
  }, [ensuredShopId, configUnits]);

  function handleAddCustomCategory() {
    const input = prompt("নতুন ক্যাটাগরির নাম লিখুন");
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
    const input = prompt("নতুন এককের নাম লিখুন");
    if (!input) return;
    const value = input.toString().trim().toLowerCase();
    if (!value) return;

    const merged = Array.from(new Set([...unitOptions, value]));
    setUnitOptions(merged);
    setSelectedUnit(value);

    const customOnly = merged.filter((u) => !configUnits.includes(u));
    localStorage.setItem(`customUnits:${ensuredShopId}`, JSON.stringify(customOnly));
  }

  async function handleSubmit(e: any) {
    e.preventDefault();
    const form = new FormData(e.target);

    const buyPriceRaw = form.get("buyPrice") as string;
    const buyPrice = isFieldVisible("buyPrice")
      ? buyPriceRaw && buyPriceRaw.toString().trim() !== ""
        ? (buyPriceRaw as string)
        : null
      : null;

    const baseUnit = isFieldVisible("unit")
      ? ((form.get("baseUnit") as string) || configUnits[0] || "pcs")
      : undefined;

    const stockQty = stockEnabled
      ? ((form.get("stockQty") as string) || "0")
      : "0";

    const expiryDate = isFieldVisible("expiry")
      ? ((form.get("expiryDate") as string) || null)
      : null;

    const size = isFieldVisible("size")
      ? ((form.get("size") as string) || "").toString().trim() || null
      : null;

    const payload: LocalProduct = {
      id: crypto.randomUUID(),
      shopId: ensuredShopId,
      name: form.get("name") as string,
      category: selectedCategory || "অন্যান্য",
      baseUnit,
      buyPrice,
      sellPrice: form.get("sellPrice") as string,
      stockQty,
      isActive: form.get("isActive") === "on",
      trackStock: stockEnabled,
      businessType,
      expiryDate,
      size,
      updatedAt: Date.now(),
      syncStatus: "new",
    };

    if (online) {
      await createProduct(payload);
      alert("পণ্য সফলভাবে যুক্ত হয়েছে");
    } else {
      await db.products.put(payload);
      await queueAdd("product", "create", payload);
      alert("পণ্য অফলাইনে সংরক্ষণ হয়েছে; সংযোগ হলে সিঙ্ক হবে।");
    }

    router.push(`/dashboard/products?shopId=${ensuredShopId}`);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">নতুন পণ্য যোগ করুন</h1>
        <p className="text-gray-600 mt-2">এই দোকানের জন্য প্রয়োজনীয় তথ্য দিয়ে পণ্য যোগ করুন।</p>
        <p className="text-sm text-gray-500 mt-1">দোকান: {shop.name}</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-8 space-y-6">
        
        {/* Product Name */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">পণ্যের নাম *</label>
          <input
            name="name"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="যেমন: চা, ডিম, কলম..."
            required={isFieldRequired("name")}
          />
          <p className="text-sm text-gray-500">সহজে চিনতে পারে এমন নাম লিখুন।</p>
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
            placeholder="যেমন: ২৫, ৯৯.৫০"
            required={isFieldRequired("sellPrice")}
          />
          <p className="text-sm text-gray-500">দশমিকসহ দাম লিখতে পারবেন।</p>
        </div>

        {/* Category (optional with custom) */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">ক্যাটাগরি (ঐচ্ছিক)</label>
          <div className="flex gap-3">
            <select
              name="category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">ক্যাটাগরি নির্বাচন করুন</option>
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
            তালিকা থেকে বেছে নিন বা নতুন ক্যাটাগরি লিখে যোগ করুন।
          </p>
        </div>

        {/* Unit (conditional) */}
        {isFieldVisible("unit") && (
          <div className="space-y-2">
            <label className="block text-base font-medium text-gray-900">একক (ঐচ্ছিক)</label>
            <div className="flex gap-3">
              <select
                name="baseUnit"
                value={selectedUnit}
                onChange={(e) => setSelectedUnit(e.target.value)}
                required={isFieldRequired("unit")}
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
              কেজি/পিস/লিটার ইত্যাদি নির্বাচন করুন; দরকার হলে নতুন একক লিখুন।
            </p>
          </div>
        )}

        {/* Stock toggle & qty */}
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input 
              type="checkbox" 
              checked={stockEnabled}
              onChange={(e) => setStockEnabled(e.target.checked)}
              className="w-5 h-5 border border-gray-300 rounded cursor-pointer"
            />
            <span className="text-base font-medium text-gray-900">স্টক ট্র্যাক (চালু/বন্ধ)</span>
          </label>
          <p className="text-sm text-gray-500">চালু করলে নিচে বর্তমান স্টক লিখুন। বন্ধ থাকলে স্টক ০ ধরা হবে।</p>
          <div className="pt-2">
            <input
              name="stockQty"
              type="number"
              step="0.01"
              min="0"
              defaultValue="0"
              required={stockEnabled && isFieldRequired("stock")}
              disabled={!stockEnabled}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100 disabled:text-gray-500"
              placeholder="যেমন: 10, 5.50"
            />
          </div>
        </div>

        {/* Advanced (optional) */}
        <details className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <summary className="cursor-pointer text-base font-semibold text-gray-900">
            উন্নত সেটিংস (ঐচ্ছিক)
          </summary>
          <div className="mt-4 space-y-4">
            {isFieldVisible("buyPrice") && (
              <div className="space-y-2">
                <label className="block text-base font-medium text-gray-900">ক্রয় মূল্য (ঐচ্ছিক)</label>
                <input
                  name="buyPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  required={isFieldRequired("buyPrice")}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="যেমন: 55.00"
                />
                <p className="text-sm text-gray-500">
                  না জানলে ফাঁকা রাখুন। শুধু হিসাবের প্রয়োজনে।
                </p>
              </div>
            )}

            {isFieldVisible("expiry") && (
              <div className="space-y-2">
                <label className="block text-base font-medium text-gray-900">মেয়াদ শেষের তারিখ</label>
                <input
                  name="expiryDate"
                  type="date"
                  required={isFieldRequired("expiry")}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            )}

            {isFieldVisible("size") && (
              <div className="space-y-2">
                <label className="block text-base font-medium text-gray-900">সাইজ / ভ্যারিয়েশন</label>
                <input
                  name="size"
                  type="text"
                  required={isFieldRequired("size")}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="যেমন: L, XL, 100ml"
                />
              </div>
            )}
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
            <span className="text-base font-medium text-gray-900">পণ্য সক্রিয় রাখুন</span>
          </label>
          <p className="text-sm text-gray-500">বন্ধ করলে পণ্য লিস্ট/সেলে দেখাবে না।</p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-4">
          <button 
            type="submit"
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg text-lg transition-colors"
          >
            ✔ পণ্য সংরক্ষণ করুন
          </button>
          <button 
            type="button"
            onClick={() => router.back()}
            className="flex-1 border border-gray-300 text-gray-900 font-medium py-4 px-6 rounded-lg text-lg hover:bg-gray-100 transition-colors"
          >
            ফিরে যান
          </button>
        </div>
      </form>
    </div>
  );
}

export default function ProductFormClient(props: Props) {
  return (
    <Suspense fallback={<div>Loading form...</div>}>
      <ProductForm {...props} />
    </Suspense>
  );
}
