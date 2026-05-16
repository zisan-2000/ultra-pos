"use client";

import { useState } from "react";
import { Check } from "lucide-react";

type Shop = {
  id: string;
  emoji: string;
  name: string;
  featured?: boolean;
  tagline: string;
  features: string[];
  workflow: { step: string; desc: string }[];
};

const shops: Shop[] = [
  {
    id: "hardware",
    emoji: "🔧",
    name: "হার্ডওয়্যার দোকান",
    featured: true,
    tagline: "Pipe, rod, wire, cement — সব ধরনের measurement এক system-এ",
    features: [
      "Rod, pipe, wire — kg/ton/ft unit-এ বিক্রি",
      "Pipe cut করলে leftover auto-save",
      "Cement ও motor — batch ও serial tracking",
      "Location-ভিত্তিক stock management",
    ],
    workflow: [
      { step: "১", desc: "Pipe 1 inch — 6 ft কাটলেন" },
      { step: "২", desc: "Leftover 4 ft auto-save" },
      { step: "৩", desc: "পরের sale-এ leftover priority দেয়" },
    ],
  },
  {
    id: "pharmacy",
    emoji: "💊",
    name: "ফার্মেসি",
    tagline: "Batch ও expiry tracking — মেয়াদ শেষ হওয়ার আগেই alert",
    features: [
      "Batch নম্বর ও expiry date tracking",
      "মেয়াদ শেষের আগে alert পাঠায়",
      "Supplier-ভিত্তিক purchase ledger",
      "Low stock reorder reminder",
    ],
    workflow: [
      { step: "১", desc: "Medicine batch + expiry input" },
      { step: "২", desc: "FIFO — পুরনো batch আগে বিক্রি" },
      { step: "৩", desc: "Expiry-র ৩০ দিন আগে alert" },
    ],
  },
  {
    id: "grocery",
    emoji: "🛒",
    name: "মুদি / গ্রোসারি",
    tagline: "Barcode scan, বাকির হিসাব, fast billing — সব এক জায়গায়",
    features: [
      "Barcode scan করে instant বিক্রি",
      "Customer বাকির হিসাব",
      "দৈনিক বিক্রি ও cash flow report",
      "Fast billing — কোনো delay নেই",
    ],
    workflow: [
      { step: "১", desc: "Barcode scan / pic click" },
      { step: "২", desc: "Cart-এ যোগ — মোট auto-calc" },
      { step: "৩", desc: "Cash বা বাকি — record automatic" },
    ],
  },
  {
    id: "sweet",
    emoji: "🍬",
    name: "দই-মিষ্টির দোকান",
    tagline: "Kg ও pcs — দুই unit-এ বিক্রি, fresh stock daily update",
    features: [
      "kg ও pcs — দুই unit-এ বিক্রি",
      "তাজা stock দৈনিক আপডেট",
      "কম stock হলে alert",
      "দ্রুত বিল ও cash collection",
    ],
    workflow: [
      { step: "১", desc: "সকালে fresh stock যোগ করুন" },
      { step: "২", desc: "kg / pcs যেভাবে চান বিক্রি" },
      { step: "৩", desc: "দিন শেষে wastage সহ report" },
    ],
  },
  {
    id: "salon",
    emoji: "✂️",
    name: "সেলুন / পার্লার",
    tagline: "Service list, customer history, booking — beauty business এর জন্য",
    features: [
      "Service list ও price management",
      "Customer বাকি ও payment history",
      "আজকের booking ও summary",
      "দৈনিক income report",
    ],
    workflow: [
      { step: "১", desc: "Service select (Hair cut, Facial...)" },
      { step: "২", desc: "Customer যোগ — history auto-save" },
      { step: "৩", desc: "Cash বা বাকি — সব track" },
    ],
  },
  {
    id: "restaurant",
    emoji: "🍲",
    name: "রেস্টুরেন্ট / ক্যান্টিন",
    tagline: "Table-wise order, dine-in / parcel — সব ব্যবস্থা",
    features: [
      "Table-ভিত্তিক order management",
      "ক্যাশ ও bKash payment",
      "বাকির customer tracking",
      "দৈনিক ও মাসিক রিপোর্ট",
    ],
    workflow: [
      { step: "১", desc: "Table select → order নিন" },
      { step: "২", desc: "Kitchen-এ ticket print" },
      { step: "৩", desc: "Bill → cash / bKash payment" },
    ],
  },
];

export function LandingForWhom() {
  const [activeId, setActiveId] = useState(shops[0].id);
  const current = shops.find((s) => s.id === activeId) ?? shops[0];

  return (
    <section className="relative overflow-hidden bg-muted/30 py-16 lg:py-24">
      {/* Section-specific animated shade — warm warning + cool primary */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-10 top-32 h-80 w-80 rounded-full bg-warning/10 blur-[120px] animate-blob-a" />
        <div className="absolute -right-10 bottom-20 h-72 w-72 rounded-full bg-primary/10 blur-[110px] animate-blob-c" />
      </div>

      <div className="mx-auto max-w-6xl px-5">
        {/* Header */}
        <div className="mb-10 text-center lg:mb-14">
          <p className="mb-3 text-sm font-bold uppercase tracking-widest text-primary">
            প্রতিটি দোকানের জন্য আলাদা বুদ্ধি
          </p>
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
            একটাই system —{" "}
            <span className="text-primary">প্রতিটি ব্যবসায় আলাদাভাবে কাজ করে</span>
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            Generic POS না — আপনার দোকানের কাজ অনুযায়ী feature দেখায়।
          </p>
        </div>

        {/* === MOBILE: card grid (unchanged) === */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:hidden">
          {shops.map((shop) => (
            <div
              key={shop.id}
              className={`relative rounded-2xl border p-5 transition ${
                shop.featured
                  ? "border-primary/40 bg-card shadow-[0_0_0_1px_rgba(22,163,74,0.15),0_8px_24px_rgba(22,163,74,0.1)]"
                  : "border-border bg-card hover:border-primary/25"
              }`}
            >
              {shop.featured && (
                <span className="absolute -top-2.5 left-5 rounded-full bg-primary px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">
                  হার্ডওয়্যার বিশেষজ্ঞ
                </span>
              )}

              <div className="mb-3 flex items-center gap-2.5">
                <span className="text-2xl">{shop.emoji}</span>
                <span
                  className={`font-bold ${
                    shop.featured ? "text-primary" : "text-foreground"
                  }`}
                >
                  {shop.name}
                </span>
              </div>

              <ul className="space-y-1.5">
                {shop.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <span className="mt-0.5 shrink-0 font-bold text-primary">·</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* === DESKTOP: tab interface (vertical tabs left + detail panel right) === */}
        <div className="hidden lg:block">
          <div className="grid grid-cols-[260px_minmax(0,1fr)] gap-6 rounded-3xl border border-border bg-card p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
            {/* Tab list */}
            <div className="space-y-1.5">
              {shops.map((shop) => {
                const isActive = activeId === shop.id;
                return (
                  <button
                    key={shop.id}
                    type="button"
                    onClick={() => setActiveId(shop.id)}
                    className={`group flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                      isActive
                        ? "border-primary bg-primary text-white shadow-[0_6px_18px_rgba(22,163,74,0.35)]"
                        : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground"
                    }`}
                  >
                    <span className="text-2xl leading-none">{shop.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm font-bold ${
                          isActive ? "text-white" : ""
                        }`}
                      >
                        {shop.name}
                      </p>
                      {shop.featured && (
                        <p
                          className={`mt-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            isActive ? "text-white/80" : "text-primary"
                          }`}
                        >
                          ⭐ বিশেষজ্ঞ
                        </p>
                      )}
                    </div>
                    <span
                      className={`text-lg leading-none transition-transform ${
                        isActive
                          ? "translate-x-0 text-white"
                          : "-translate-x-1 text-muted-foreground/50 group-hover:translate-x-0 group-hover:text-primary"
                      }`}
                    >
                      →
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Detail panel */}
            <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-6">
              {/* Left: features */}
              <div className="space-y-5">
                <div>
                  <div className="mb-2 flex items-center gap-3">
                    <span className="text-3xl">{current.emoji}</span>
                    <h3 className="text-xl font-bold text-foreground">
                      {current.name}
                    </h3>
                    {current.featured && (
                      <span className="rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        বিশেষজ্ঞ
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {current.tagline}
                  </p>
                </div>

                <div>
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    এই দোকানের জন্য বিশেষ feature
                  </p>
                  <ul className="space-y-2.5">
                    {current.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5">
                        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                        <span className="text-sm leading-relaxed text-foreground">
                          {f}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Right: workflow mockup */}
              <div className="rounded-2xl border border-border bg-linear-to-br from-muted/40 to-card p-4">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  কীভাবে কাজ করে
                </p>
                <div className="space-y-2.5">
                  {current.workflow.map((w, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 shadow-sm"
                    >
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary">
                        {w.step}
                      </span>
                      <p className="text-xs leading-relaxed text-foreground">
                        {w.desc}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-primary/20 bg-primary/8 px-3 py-2 text-center">
                  <p className="text-[11px] font-semibold text-primary">
                    সবকিছু automatic — কোনো manual hisab নেই
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
