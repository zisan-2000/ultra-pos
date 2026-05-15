import Link from "next/link";
import { ShopTypeSelector } from "./ShopTypeSelector";

const stats = [
  { value: "১৬+", label: "ধরনের দোকান" },
  { value: "৯৯%", label: "uptime গ্যারান্টি" },
  { value: "নেট", label: "ছাড়াও চলে" },
  { value: "দ্রুত", label: "সেটআপ হয়" },
];

export function LandingHero() {
  return (
    <section className="relative mx-auto max-w-5xl px-5 pb-16 pt-28 text-center">
      {/* Live badge */}
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/8 px-4 py-1.5 text-xs font-semibold text-primary">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
        বাংলাদেশের ব্যবসার জন্য তৈরি
      </div>

      {/* Main headline */}
      <h1 className="mb-4 text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-[3.5rem]">
        আপনার দোকানের হিসাব{" "}
        <span className="relative inline-block text-primary">
          এখন সহজ
          <svg
            className="absolute -bottom-1 left-0 w-full"
            viewBox="0 0 200 8"
            fill="none"
            aria-hidden
          >
            <path
              d="M2 6 Q50 2 100 4 Q150 6 198 2"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="text-primary/40"
            />
          </svg>
        </span>
      </h1>

      {/* Subtext */}
      <p className="mx-auto mb-3 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
        মুদি, হার্ডওয়্যার, ফার্মেসি, মিষ্টি, সেলুন, রেস্টুরেন্ট —
        <br className="hidden sm:block" />
        প্রতিটি ব্যবসার জন্য{" "}
        <span className="font-semibold text-foreground">আলাদা workflow সহ একটাই smart system।</span>
      </p>

      {/* Stats strip */}
      <div className="mb-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        {stats.map((s) => (
          <div key={s.label} className="flex items-baseline gap-1.5">
            <span className="text-base font-bold text-primary">{s.value}</span>
            <span className="text-sm text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Interactive shop selector */}
      <ShopTypeSelector />

      {/* CTAs */}
      <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Link
          href="/login"
          className="inline-flex h-12 w-full items-center justify-center rounded-full bg-linear-to-r from-primary to-primary-hover px-10 text-base font-bold text-white shadow-[0_8px_22px_rgba(22,163,74,0.35)] transition hover:brightness-105 active:scale-95 sm:w-auto"
        >
          আজই শুরু করুন →
        </Link>
        <a
          href="#pain"
          className="inline-flex h-12 w-full items-center justify-center rounded-full border border-border bg-card/80 px-8 text-base font-semibold text-foreground/80 transition hover:bg-muted active:scale-95 sm:w-auto"
        >
          কীভাবে কাজ করে দেখি
        </a>
      </div>

      {/* Trust note */}
      <p className="mt-5 text-xs text-muted-foreground">
        ✓ ৫ মিনিটে সেটআপ &nbsp;·&nbsp; ✓ ইন্সটল লাগবে না &nbsp;·&nbsp; ✓ নেট ছাড়াও চলে
      </p>
    </section>
  );
}
