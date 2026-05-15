const shops = [
  {
    emoji: "🔧",
    name: "হার্ডওয়্যার দোকান",
    featured: true,
    features: [
      "Rod, pipe, wire — kg/ton/ft unit-এ বিক্রি",
      "Pipe cut করলে leftover auto-save",
      "Cement ও motor — batch ও serial tracking",
      "Location-ভিত্তিক stock management",
    ],
  },
  {
    emoji: "💊",
    name: "ফার্মেসি",
    featured: false,
    features: [
      "Batch নম্বর ও expiry date tracking",
      "মেয়াদ শেষের আগে alert পাঠায়",
      "Supplier-ভিত্তিক purchase ledger",
      "Low stock reorder reminder",
    ],
  },
  {
    emoji: "🛒",
    name: "মুদি / গ্রোসারি",
    featured: false,
    features: [
      "Barcode scan করে instant বিক্রি",
      "Customer বাকির হিসাব",
      "দৈনিক বিক্রি ও cash flow report",
      "Fast billing — কোনো delay নেই",
    ],
  },
  {
    emoji: "🍬",
    name: "দই-মিষ্টির দোকান",
    featured: false,
    features: [
      "kg ও pcs — দুই unit-এ বিক্রি",
      "তাজা stock দৈনিক আপডেট",
      "কম stock হলে alert",
      "দ্রুত বিল ও cash collection",
    ],
  },
  {
    emoji: "✂️",
    name: "সেলুন / পার্লার",
    featured: false,
    features: [
      "Service list ও price management",
      "Customer বাকি ও payment history",
      "আজকের booking ও summary",
      "দৈনিক income report",
    ],
  },
  {
    emoji: "🍲",
    name: "রেস্টুরেন্ট / ক্যান্টিন",
    featured: false,
    features: [
      "Table-ভিত্তিক order management",
      "ক্যাশ ও bKash payment",
      "বাকির customer tracking",
      "দৈনিক ও মাসিক রিপোর্ট",
    ],
  },
];

export function LandingForWhom() {
  return (
    <section className="bg-muted/30 py-20">
      <div className="mx-auto max-w-6xl px-5">
        {/* Header */}
        <div className="mb-14 text-center">
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

        {/* Shop cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shops.map((shop) => (
            <div
              key={shop.name}
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
                <span className={`font-bold ${shop.featured ? "text-primary" : "text-foreground"}`}>
                  {shop.name}
                </span>
              </div>

              <ul className="space-y-1.5">
                {shop.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-0.5 shrink-0 font-bold text-primary">·</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
