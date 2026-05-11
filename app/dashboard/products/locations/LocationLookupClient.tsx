"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type LocationRow = {
  id: string;
  productId: string;
  productName: string;
  category: string;
  baseUnit: string;
  trackStock: boolean;
  stockQty: string;
  reorderPoint: number | null;
  location: string;
  sku: string | null;
  barcode: string | null;
  variantId: string | null;
  variantLabel: string | null;
  source: "base" | "variant";
};

function formatQty(value: string | number, unit: string) {
  const qty = Number(value ?? 0);
  const formatted = qty.toLocaleString("bn-BD", {
    minimumFractionDigits: Number.isInteger(qty) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(qty) ? 0 : 2,
  });
  return `${formatted} ${unit}`.trim();
}

export default function LocationLookupClient({
  rows,
  shopId,
  initialQuery = "",
  initialProductId = "",
}: {
  rows: LocationRow[];
  shopId: string;
  initialQuery?: string;
  initialProductId?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [productFilter, setProductFilter] = useState(initialProductId);

  const productOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) {
      if (!seen.has(row.productId)) {
        seen.set(row.productId, row.productName);
      }
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (productFilter && row.productId !== productFilter) return false;
      if (!q) return true;
      const haystack = [
        row.productName,
        row.category,
        row.location,
        row.variantLabel || "",
        row.sku || "",
        row.barcode || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [productFilter, query, rows]);

  const locationCount = useMemo(
    () => new Set(filtered.map((row) => row.location.trim().toLowerCase())).size,
    [filtered]
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/20 bg-primary-soft/35 p-4">
        <p className="text-sm font-semibold text-foreground">কীভাবে ব্যবহার করবেন</p>
        <p className="mt-1 text-xs leading-6 text-muted-foreground">
          র্যাক, শেলফ, গুদাম বা কোড লিখে খুঁজুন। base product আর variant-এর location আলাদা
          হলে আলাদা row-এ দেখাবে।
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="লোকেশন, পণ্য, ভ্যারিয়েন্ট, SKU, বারকোড দিয়ে খুঁজুন..."
          className="h-11 rounded-xl border border-border bg-card px-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          className="h-11 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">সব পণ্য</option>
          {productOptions.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1">
          দেখা যাচ্ছে {filtered.length.toLocaleString("bn-BD")}টি row
        </span>
        <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1">
          {locationCount.toLocaleString("bn-BD")}টি আলাদা লোকেশন
        </span>
        {(query || productFilter) && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setProductFilter("");
            }}
            className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 font-semibold text-foreground hover:bg-muted"
          >
            Clear filter
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">কোনো location row পাওয়া যায়নি</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">লোকেশন</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">পণ্য</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">ধরন</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">স্টক</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">SKU / বারকোড</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Restock</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-b border-border/50 align-top hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full border border-primary/20 bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">
                        {row.location}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/products/${row.productId}`}
                        className="font-semibold text-foreground hover:text-primary"
                      >
                        {row.productName}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">{row.category}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {row.variantLabel ? (
                        <span>{row.variantLabel}</span>
                      ) : (
                        <span>Base product</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">
                      {row.trackStock ? formatQty(row.stockQty, row.baseUnit) : "ট্র্যাক নয়"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {row.sku || row.barcode
                        ? `${row.sku || "—"}${row.barcode ? ` · ${row.barcode}` : ""}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {row.reorderPoint ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-border md:hidden">
            {filtered.map((row) => (
              <div key={row.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{row.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.variantLabel || "Base product"} · {row.category}
                    </p>
                  </div>
                  <span className="inline-flex rounded-full border border-primary/20 bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary">
                    {row.location}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-foreground">
                    {row.trackStock ? formatQty(row.stockQty, row.baseUnit) : "ট্র্যাক নয়"}
                  </span>
                  {row.reorderPoint ? (
                    <span className="inline-flex items-center rounded-full border border-warning/20 bg-warning-soft px-2.5 py-1 text-warning">
                      Restock {row.reorderPoint}
                    </span>
                  ) : null}
                </div>
                {row.sku || row.barcode ? (
                  <p className="text-xs text-muted-foreground">
                    {row.sku || "—"}
                    {row.barcode ? ` · ${row.barcode}` : ""}
                  </p>
                ) : null}
                <Link
                  href={`/dashboard/products/${row.productId}`}
                  className="inline-flex text-xs font-semibold text-primary hover:underline"
                >
                  পণ্য খুলুন
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
        Stock audit tip: worker যদি বলে item “নেই”, আগে এই page-এ location search করুন। wrong
        shelf/location থাকলে product edit করে ঠিক করুন।
      </div>

      <div className="flex justify-end">
        <Link
          href={`/dashboard/reports?shopId=${shopId}`}
          className="text-xs font-semibold text-primary hover:underline"
        >
          রিপোর্টেও লোকেশন দেখুন
        </Link>
      </div>
    </div>
  );
}
