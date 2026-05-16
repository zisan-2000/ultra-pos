const pairs = [
  {
    pain: "কার কাছে কত বাকি আছে মনে থাকে না — খাতা হারিয়ে যায়",
    fix:  "Customer-ভিত্তিক বাকির ledger, payment history ও reminder সহ",
  },
  {
    pain: "কোন পণ্যের stock শেষ হয়ে যাচ্ছে — জানার উপায় নেই",
    fix:  "Low stock alert, কম হলে automatic reorder reminder পাঠায়",
  },
  {
    pain: "Pipe বা কাপড় কেটে বিক্রি করলে leftover হিসাব থাকে না",
    fix:  "Cut-length ও remnant auto-save হয় — কিছুই নষ্ট বা মিস হয় না",
  },
  {
    pain: "দিন শেষে বিক্রি, লাভ, খরচ হিসাব করতে ঘণ্টা লেগে যায়",
    fix:  "এক click-এ দৈনিক রিপোর্ট — Excel-এও download করা যায়",
  },
];

export function LandingPainSolution() {
  return (
    <section id="pain" className="relative overflow-hidden py-16 lg:py-24">
      {/* Section-specific animated shade — pain (danger) → solution (primary) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[5%] top-20 h-72 w-72 rounded-full bg-danger/10 blur-[110px] animate-blob-b" />
        <div className="absolute bottom-10 right-[8%] h-80 w-80 rounded-full bg-primary/12 blur-[120px] animate-blob-c" />
      </div>

      <div className="mx-auto max-w-6xl px-5">
        {/* Header */}
        <div className="mb-10 text-center lg:mb-14">
          <p className="mb-3 text-sm font-bold uppercase tracking-widest text-primary">
            সমস্যা ও সমাধান
          </p>
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
            খাতা থেকে dashboard —{" "}
            <span className="text-primary">হিসাব এখন চোখের সামনে</span>
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            প্রতিটি দোকানদারের পরিচিত সমস্যা, আর তার সরাসরি সমাধান।
          </p>
        </div>

        {/* Before / After header */}
        <div className="mb-4 hidden grid-cols-2 gap-4 sm:grid">
          <div className="flex items-center gap-2 rounded-2xl border border-danger/25 bg-danger-soft/60 px-5 py-3">
            <span className="text-lg">😓</span>
            <span className="font-bold text-danger">আগে এভাবে চলত</span>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/6 px-5 py-3">
            <span className="text-lg">✅</span>
            <span className="font-bold text-primary">এখন SellFlick-এ</span>
          </div>
        </div>

        {/* Pair grid */}
        <div className="space-y-3">
          {pairs.map((p, i) => (
            <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Pain */}
              <div className="flex items-start gap-3 rounded-2xl border border-danger/25 bg-danger-soft/50 px-5 py-4">
                <span className="mt-0.5 shrink-0 text-lg leading-none text-danger">✗</span>
                <p className="text-sm font-medium leading-relaxed text-danger">
                  {p.pain}
                </p>
              </div>
              {/* Solution */}
              <div className="flex items-start gap-3 rounded-2xl border border-primary/25 bg-primary/6 px-5 py-4">
                <span className="mt-0.5 shrink-0 text-lg leading-none text-primary">✓</span>
                <p className="text-sm font-semibold leading-relaxed text-foreground">
                  {p.fix}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom tagline */}
        <p className="mt-10 text-center text-base font-semibold text-muted-foreground">
          শুধু বিক্রি না —{" "}
          <span className="text-foreground">আপনার দোকানের পুরো operating system।</span>
        </p>
      </div>
    </section>
  );
}
