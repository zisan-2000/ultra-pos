"use client";

import { useState } from "react";

type BadgeType = "ok" | "low" | "batch" | "serial" | "cut" | "service";

const badge: Record<BadgeType, { bg: string; text: string; label: string }> = {
  ok:      { bg: "bg-emerald-100 dark:bg-emerald-950/60", text: "text-emerald-700 dark:text-emerald-400", label: "✓" },
  low:     { bg: "bg-amber-100 dark:bg-amber-950/60",    text: "text-amber-700 dark:text-amber-400",    label: "⚠" },
  batch:   { bg: "bg-orange-100 dark:bg-orange-950/60",  text: "text-orange-600 dark:text-orange-400",  label: "Batch" },
  serial:  { bg: "bg-blue-100 dark:bg-blue-950/60",      text: "text-blue-600 dark:text-blue-400",      label: "Serial" },
  cut:     { bg: "bg-purple-100 dark:bg-purple-950/60",  text: "text-purple-600 dark:text-purple-400",  label: "Cut" },
  service: { bg: "bg-primary/10",                        text: "text-primary",                          label: "Service" },
};

type Item = { name: string; qty: string; b: BadgeType };

type Shop = {
  id: string;
  emoji: string;
  label: string;
  items: Item[];
  highlight: string;
  sale: string;
};

const shops: Shop[] = [
  {
    id: "hardware",
    emoji: "🔧",
    label: "হার্ডওয়্যার",
    items: [
      { name: "PVC Pipe 1 inch",         qty: "৪৩২ ft মজুদ",         b: "ok" },
      { name: "MS Rod 12mm",              qty: "৩.২ টন মজুদ",         b: "ok" },
      { name: "Cement 50kg — BATCH-A",   qty: "৮৬ বস্তা",            b: "batch" },
      { name: "Motor 1HP — MTR-1HP-5001", qty: "serial tracked",     b: "serial" },
    ],
    highlight: "✂️  Cut remnant: ১১ ft auto-saved — কিছু নষ্ট হয়নি",
    sale: "৳ ৪৮,৫০০",
  },
  {
    id: "pharmacy",
    emoji: "💊",
    label: "ফার্মেসি",
    items: [
      { name: "Napa 500mg — BATCH-2024B", qty: "৫০০ পিস",          b: "batch" },
      { name: "Azithromycin 500mg",        qty: "কম আছে — ৪৫ পিস", b: "low" },
      { name: "Saline 1L — BATCH-SL-09",   qty: "৪০ পিস",           b: "batch" },
      { name: "Antacid 250mg",             qty: "৮৫০ পিস মজুদ",     b: "ok" },
    ],
    highlight: "⚠️  Azithromycin Exp: Mar 2026 — restock reminder চালু",
    sale: "৳ ১২,৩০০",
  },
  {
    id: "grocery",
    emoji: "🛒",
    label: "মুদি",
    items: [
      { name: "মিনিকেট চাল",   qty: "৬৫ কেজি মজুদ",     b: "ok" },
      { name: "আটা ২কেজি",      qty: "মাত্র ৮ পিস বাকি", b: "low" },
      { name: "সয়াবিন তেল ৫L", qty: "২৪ বোতল",          b: "ok" },
      { name: "চিনি কেজি",      qty: "৪৫ কেজি",           b: "ok" },
    ],
    highlight: "📦  আটা stock কম — reorder alert পাঠানো হয়েছে",
    sale: "৳ ৮,৯০০",
  },
  {
    id: "sweet",
    emoji: "🍬",
    label: "মিষ্টি",
    items: [
      { name: "রসগোল্লা (পিস)", qty: "৪৫ পিস মজুদ",  b: "ok" },
      { name: "দই (কেজি)",       qty: "১২ কেজি তাজা",  b: "ok" },
      { name: "সন্দেশ",          qty: "মাত্র ৮ পিস",   b: "low" },
      { name: "চমচম",            qty: "৩২ পিস",        b: "ok" },
    ],
    highlight: "🔥  সন্দেশ fast selling — আজ ২য়বার restock করা হয়েছে",
    sale: "৳ ৮,৫০০",
  },
  {
    id: "salon",
    emoji: "✂️",
    label: "সেলুন",
    items: [
      { name: "Hair Cut",         qty: "৳ ১০০",   b: "service" },
      { name: "Facial + Cleanup", qty: "৳ ৮০০",  b: "service" },
      { name: "Hair Color",       qty: "৳ ১,২০০", b: "service" },
      { name: "Shaving",          qty: "৳ ৫০",    b: "service" },
    ],
    highlight: "👤  রহিম ভাই বাকি ৳৫০০ · আজকের বুকিং: ১২ জন",
    sale: "৳ ৪,৬০০",
  },
  {
    id: "restaurant",
    emoji: "🍲",
    label: "রেস্টুরেন্ট",
    items: [
      { name: "ভাত + তরকারি",    qty: "৳ ১২০", b: "service" },
      { name: "চিকেন বিরিয়ানি", qty: "৳ ১৮০", b: "service" },
      { name: "রুটি + ডাল",      qty: "৳ ৭০",  b: "service" },
      { name: "ফ্রাইড রাইস",     qty: "৳ ১৫০", b: "service" },
    ],
    highlight: "🪑  Table ৩ বাকি ৳৩৬০ · আজকের অর্ডার: ৪৮ টি",
    sale: "৳ ৭,২০০",
  },
  {
    id: "electronics",
    emoji: "📱",
    label: "ইলেকট্রনিক্স",
    items: [
      { name: "Samsung A54 — SM-A546",  qty: "৫ পিস",          b: "serial" },
      { name: "iPhone 15 Pro",           qty: "মাত্র ২ পিস",    b: "low" },
      { name: "Realme C67",              qty: "৮ পিস মজুদ",     b: "ok" },
      { name: "Charger 33W",             qty: "৪৫ পিস",         b: "ok" },
    ],
    highlight: "📋  Samsung A54 — warranty card ও IMEI auto-tracked",
    sale: "৳ ৩,৪৫,০০০",
  },
  {
    id: "clothing",
    emoji: "👗",
    label: "কাপড়",
    items: [
      { name: "কটন শার্ট (M/L/XL)", qty: "৩২ পিস মজুদ",  b: "ok" },
      { name: "শাড়ি — LOT-S24",     qty: "২৩ পিস",        b: "batch" },
      { name: "Jeans (32-36)",       qty: "মাত্র ৮ পিস",   b: "low" },
      { name: "T-Shirt",             qty: "৪৫ পিস",        b: "ok" },
    ],
    highlight: "🏷️  Jeans size ৩২ শেষ হয়ে যাচ্ছে — reorder করুন",
    sale: "৳ ১৮,৫০০",
  },
  {
    id: "shoes",
    emoji: "👟",
    label: "জুতা",
    items: [
      { name: "Nike Sneaker (40-43)", qty: "১৫ জোড়া",     b: "ok" },
      { name: "Formal Shoes",         qty: "মাত্র ৮ জোড়া", b: "low" },
      { name: "Sandal (37-41)",       qty: "৩২ জোড়া",     b: "ok" },
      { name: "Ladies Heel",          qty: "মাত্র ৬ জোড়া", b: "low" },
    ],
    highlight: "📦  Formal Shoes size ৪১ — reorder alert পাঠানো হয়েছে",
    sale: "৳ ২২,০০০",
  },
  {
    id: "stationery",
    emoji: "📚",
    label: "স্টেশনারি",
    items: [
      { name: "A4 Paper (ream)",  qty: "৫০ ream মজুদ", b: "ok" },
      { name: "Ball Pen (box)",   qty: "মাত্র ২০ box",  b: "low" },
      { name: "Notebook A5",      qty: "১৫০ পিস",      b: "ok" },
      { name: "Permanent Marker", qty: "৩০ পিস",       b: "ok" },
    ],
    highlight: "🖊️  Ball Pen stock কম — supplier order দেওয়া হয়েছে",
    sale: "৳ ৪,৫০০",
  },
  {
    id: "cosmetics",
    emoji: "💄",
    label: "কসমেটিক্স",
    items: [
      { name: "Fair & Lovely",   qty: "৮০ পিস",        b: "ok" },
      { name: "Lip Gloss",       qty: "৪৫ পিস মজুদ",  b: "ok" },
      { name: "Hair Oil — LOT",  qty: "মাত্র ৩৫ পিস", b: "low" },
      { name: "Foundation SPF",  qty: "১৮ পিস",        b: "ok" },
    ],
    highlight: "🧴  Hair Oil batch expiry check — সব ঠিক আছে",
    sale: "৳ ৭,৮০০",
  },
  {
    id: "electrical",
    emoji: "⚡",
    label: "ইলেকট্রিক্যাল",
    items: [
      { name: "Copper Wire 7/22", qty: "৪৫০ ft মজুদ",   b: "cut" },
      { name: "Switch (Anchor)",  qty: "১৫০ পিস",       b: "ok" },
      { name: "Bulb 18W",         qty: "৬৫ পিস",        b: "ok" },
      { name: "MCB 16A",          qty: "মাত্র ৩৫ পিস",  b: "low" },
    ],
    highlight: "✂️  Wire cut: ১৫ ft remnant auto-saved — নষ্ট হয়নি",
    sale: "৳ ১৮,৩০০",
  },
  {
    id: "computer",
    emoji: "💻",
    label: "কম্পিউটার",
    items: [
      { name: "RAM 8GB DDR4 — SN-5521", qty: "serial tracked",   b: "serial" },
      { name: "SSD 512GB — SN-8820",    qty: "serial tracked",   b: "serial" },
      { name: "Keyboard",               qty: "মাত্র ১২ পিস",     b: "low" },
      { name: "Mouse Wireless",         qty: "২৫ পিস মজুদ",     b: "ok" },
    ],
    highlight: "🔒  SSD serial number — warranty claim এ সহজে খুঁজে পাবেন",
    sale: "৳ ৮৫,৫০০",
  },
  {
    id: "furniture",
    emoji: "🪑",
    label: "ফার্নিচার",
    items: [
      { name: "Wooden Chair",      qty: "৮ পিস মজুদ",    b: "ok" },
      { name: "Steel Almirah",     qty: "মাত্র ৩ পিস",   b: "low" },
      { name: "Office Table",      qty: "৫ পিস",          b: "ok" },
      { name: "Sofa (3-seater)",   qty: "২ পিস মজুদ",    b: "ok" },
    ],
    highlight: "📋  Steel Almirah stock শেষ হচ্ছে — factory order করুন",
    sale: "৳ ৩৫,০০০",
  },
  {
    id: "auto-parts",
    emoji: "🚗",
    label: "অটো পার্টস",
    items: [
      { name: "Brake Pad (Toyota) — SN", qty: "serial tracked",  b: "serial" },
      { name: "Engine Oil 1L",            qty: "৮৫ পিস মজুদ",   b: "ok" },
      { name: "Air Filter",               qty: "মাত্র ৪৫ পিস",  b: "low" },
      { name: "Battery 12V",              qty: "৮ পিস",          b: "ok" },
    ],
    highlight: "🔧  Brake Pad serial দিয়ে vehicle history track করুন",
    sale: "৳ ২৮,৯০০",
  },
  {
    id: "tailoring",
    emoji: "🧵",
    label: "টেইলারিং",
    items: [
      { name: "Shirt Stitching",   qty: "৳ ৩৫০",   b: "service" },
      { name: "Suit / Blazer",     qty: "৳ ২,৫০০", b: "service" },
      { name: "Saree Blouse",      qty: "৳ ২৫০",   b: "service" },
      { name: "Alteration",        qty: "৳ ১৫০",   b: "service" },
    ],
    highlight: "🎁  আজকের delivery: ৭টি order ready — customer notify করুন",
    sale: "৳ ৫,৮০০",
  },
];

export function ShopTypeSelector() {
  const [activeId, setActiveId] = useState("hardware");
  const [fading, setFading] = useState(false);

  const select = (id: string) => {
    if (id === activeId) return;
    setFading(true);
    setTimeout(() => {
      setActiveId(id);
      setFading(false);
    }, 130);
  };

  const current = shops.find((s) => s.id === activeId)!;

  return (
    <div className="space-y-5">
      {/* Shop type pills — horizontal scroll on mobile */}
      <div className="relative">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide sm:flex-wrap sm:justify-center sm:overflow-x-visible sm:pb-0">
          {shops.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => select(s.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-all duration-150 ${
                activeId === s.id
                  ? "border-primary bg-primary text-white shadow-[0_4px_16px_rgba(22,163,74,0.4)]"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              <span className="text-base leading-none">{s.emoji}</span>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mini dashboard preview */}
      <div
        className={`mx-auto max-w-sm overflow-hidden rounded-2xl border border-border shadow-[0_20px_48px_rgba(15,23,42,0.14)] transition-opacity duration-130 ${
          fading ? "opacity-0" : "opacity-100"
        }`}
      >
        {/* App bar */}
        <div className="flex items-center justify-between bg-primary px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none">{current.emoji}</span>
            <span className="font-bold text-white">{current.label} দোকান</span>
          </div>
          <div className="flex gap-1.5">
            <div className="h-2 w-2 rounded-full bg-white/25" />
            <div className="h-2 w-2 rounded-full bg-white/25" />
            <div className="h-2 w-2 rounded-full bg-white/50" />
          </div>
        </div>

        {/* Product list */}
        <div className="divide-y divide-border bg-card">
          {current.items.map((item, i) => (
            <div key={i} className="flex items-center justify-between gap-2 px-4 py-2.5">
              <span className="min-w-0 truncate text-sm text-foreground">{item.name}</span>
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden text-[11px] text-muted-foreground xs:block">{item.qty}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge[item.b].bg} ${badge[item.b].text}`}
                >
                  {badge[item.b].label}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Highlight row */}
        <div className="border-t border-primary/20 bg-primary/6 px-4 py-2.5">
          <p className="text-xs font-semibold text-primary">{current.highlight}</p>
        </div>

        {/* Stat bar */}
        <div className="flex items-center justify-between border-t border-border bg-muted/50 px-4 py-3">
          <span className="text-sm font-semibold text-muted-foreground">আজকের বিক্রি</span>
          <span className="text-xl font-bold text-foreground">{current.sale}</span>
        </div>
      </div>
    </div>
  );
}
