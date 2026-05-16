"use client";

import { useState } from "react";

type BadgeType = "ok" | "low" | "batch" | "serial" | "cut" | "service";

const badge: Record<BadgeType, { bg: string; text: string; label: string }> = {
  ok:      { bg: "bg-success-soft",        text: "text-success",          label: "✓" },
  low:     { bg: "bg-warning-soft",        text: "text-warning",          label: "⚠" },
  batch:   { bg: "bg-orange-100 dark:bg-orange-950/60", text: "text-orange-600 dark:text-orange-400", label: "Batch" },
  serial:  { bg: "bg-blue-100 dark:bg-blue-950/60",     text: "text-blue-600 dark:text-blue-400",     label: "Serial" },
  cut:     { bg: "bg-purple-100 dark:bg-purple-950/60", text: "text-purple-600 dark:text-purple-400", label: "Cut" },
  service: { bg: "bg-primary/10",                       text: "text-primary",                         label: "Service" },
};

type Item = { name: string; qty: string; b: BadgeType };

type Shop = {
  id: string;
  emoji: string;
  label: string;
  items: Item[];
  highlight: string;
  sale: string;
  todayCount: string;
  topItem: string;
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
    todayCount: "২৩",
    topItem: "PVC Pipe",
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
    todayCount: "৪১",
    topItem: "Napa 500mg",
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
    todayCount: "৫৬",
    topItem: "মিনিকেট চাল",
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
    todayCount: "৩৮",
    topItem: "সন্দেশ",
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
    todayCount: "১২",
    topItem: "Hair Cut",
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
    todayCount: "৪৮",
    topItem: "বিরিয়ানি",
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
    todayCount: "৭",
    topItem: "Samsung A54",
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
    todayCount: "১৯",
    topItem: "শাড়ি",
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
    todayCount: "১৪",
    topItem: "Sandal",
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
    todayCount: "২৭",
    topItem: "A4 Paper",
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
    todayCount: "২২",
    topItem: "Lip Gloss",
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
    todayCount: "১৮",
    topItem: "Copper Wire",
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
    todayCount: "৯",
    topItem: "SSD 512GB",
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
    todayCount: "৪",
    topItem: "Office Table",
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
    todayCount: "১৩",
    topItem: "Engine Oil",
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
    todayCount: "১৭",
    topItem: "Shirt Stitching",
  },
];

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_48px_rgba(15,23,42,0.14)]">
      {children}
    </div>
  );
}

function InventoryView({ shop }: { shop: Shop }) {
  return (
    <PhoneFrame>
      {/* App bar */}
      <div className="flex items-center justify-between bg-primary px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">{shop.emoji}</span>
          <span className="text-sm font-bold text-white">স্টক ও পণ্য</span>
        </div>
        <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold text-white">
          {shop.items.length}
        </span>
      </div>

      {/* Product list */}
      <div className="divide-y divide-border bg-card">
        {shop.items.map((item, i) => (
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

      {/* Highlight */}
      <div className="border-t border-primary/20 bg-primary/6 px-4 py-2.5">
        <p className="text-xs font-semibold text-primary">{shop.highlight}</p>
      </div>
    </PhoneFrame>
  );
}

function PosView({ shop }: { shop: Shop }) {
  return (
    <PhoneFrame>
      {/* App bar */}
      <div className="flex items-center justify-between bg-foreground px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-background">🧾 নতুন বিক্রি</span>
        </div>
        <span className="rounded-full bg-warning px-2 py-0.5 text-[10px] font-bold text-white">
          POS
        </span>
      </div>

      {/* Product grid (2x2) */}
      <div className="grid grid-cols-2 gap-2 bg-muted/30 p-3">
        {shop.items.slice(0, 4).map((item, i) => (
          <div
            key={i}
            className="rounded-xl border border-border bg-card p-2 shadow-sm"
          >
            <p className="line-clamp-2 text-[11px] font-semibold text-foreground">
              {item.name}
            </p>
            <p className="mt-1 text-[10px] text-primary font-bold">{item.qty}</p>
          </div>
        ))}
      </div>

      {/* Cart preview */}
      <div className="space-y-1 border-t border-border bg-card px-4 py-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">কার্টে আইটেম</span>
          <span className="font-bold text-foreground">৩টি</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">মোট</span>
          <span className="text-base font-bold text-success">{shop.sale}</span>
        </div>
      </div>

      {/* CTA */}
      <div className="border-t border-border bg-card px-4 pb-3 pt-2">
        <div className="rounded-full bg-primary py-2 text-center text-xs font-bold text-white">
          ✓ বিক্রি কনফার্ম
        </div>
      </div>
    </PhoneFrame>
  );
}

function ReportView({ shop }: { shop: Shop }) {
  return (
    <PhoneFrame>
      {/* App bar */}
      <div className="flex items-center justify-between bg-warning px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">📊 আজকের রিপোর্ট</span>
        </div>
        <span className="rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-bold text-white">
          LIVE
        </span>
      </div>

      {/* Big stat */}
      <div className="border-b border-border bg-linear-to-br from-success-soft/60 to-card px-4 py-4 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-success/80">
          আজকের বিক্রি
        </p>
        <p className="mt-1 text-2xl font-extrabold text-foreground">{shop.sale}</p>
      </div>

      {/* Sub stats */}
      <div className="grid grid-cols-2 divide-x divide-border border-b border-border bg-card">
        <div className="px-3 py-3 text-center">
          <p className="text-[10px] text-muted-foreground">মোট order</p>
          <p className="mt-0.5 text-lg font-bold text-foreground">{shop.todayCount}</p>
        </div>
        <div className="px-3 py-3 text-center">
          <p className="text-[10px] text-muted-foreground">টপ আইটেম</p>
          <p className="mt-0.5 truncate text-xs font-bold text-primary">{shop.topItem}</p>
        </div>
      </div>

      {/* Highlight */}
      <div className="bg-warning-soft/40 px-4 py-2.5">
        <p className="text-[11px] font-semibold text-warning">{shop.highlight}</p>
      </div>

      {/* Footer */}
      <div className="border-t border-border bg-card px-4 py-2 text-center">
        <p className="text-[10px] text-muted-foreground">
          Excel-এ ডাউনলোড করা যাবে
        </p>
      </div>
    </PhoneFrame>
  );
}

const VIEW_LABELS = {
  inventory: "স্টক",
  pos: "বিক্রি",
  report: "রিপোর্ট",
} as const;
type ViewKey = keyof typeof VIEW_LABELS;

export function ShopTypeSelector() {
  const [activeId, setActiveId] = useState("hardware");
  const [activeView, setActiveView] = useState<ViewKey>("inventory");
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
    <div className="space-y-6">
      {/* Shop type pills — horizontal scroll on mobile, wrap on desktop */}
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

      {/* === MOBILE: single phone + view switcher === */}
      <div className="lg:hidden">
        {/* View switcher tabs */}
        <div className="mx-auto mb-3 flex w-fit gap-1 rounded-full border border-border bg-card p-1">
          {(Object.keys(VIEW_LABELS) as ViewKey[]).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => setActiveView(view)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                activeView === view
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {VIEW_LABELS[view]}
            </button>
          ))}
        </div>

        <div
          className={`transition-opacity duration-150 ${
            fading ? "opacity-0" : "opacity-100"
          }`}
        >
          {activeView === "inventory" && <InventoryView shop={current} />}
          {activeView === "pos" && <PosView shop={current} />}
          {activeView === "report" && <ReportView shop={current} />}
        </div>
      </div>

      {/* === DESKTOP: 3 phones side-by-side === */}
      <div
        className={`hidden transition-opacity duration-150 lg:block ${
          fading ? "opacity-0" : "opacity-100"
        }`}
      >
        <div className="grid grid-cols-3 gap-6">
          <div className="space-y-2">
            <div className="text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/8 px-3 py-1 text-[11px] font-bold text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                স্টক ভিউ
              </span>
            </div>
            <InventoryView shop={current} />
          </div>
          <div className="space-y-2">
            <div className="text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/25 bg-warning-soft/60 px-3 py-1 text-[11px] font-bold text-warning">
                <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                বিক্রি / POS
              </span>
            </div>
            <PosView shop={current} />
          </div>
          <div className="space-y-2">
            <div className="text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success-soft/60 px-3 py-1 text-[11px] font-bold text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                রিপোর্ট
              </span>
            </div>
            <ReportView shop={current} />
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          ↑ {current.label} দোকানের জন্য — তিনটি স্ক্রিন একসাথে দেখুন
        </p>
      </div>
    </div>
  );
}
