// app/page.tsx

import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "SellFlick POS",
  url: "https://sellflickpos.com/",
  logo: "https://sellflickpos.com/icons/icon-512x512.png?v=20260418",
  description:
    "বাংলাদেশের দোকান ও ব্যবসার জন্য POS, inventory, purchase, due, invoice এবং হিসাব সফটওয়্যার।",
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "SellFlick POS",
  url: "https://sellflickpos.com/",
  inLanguage: "bn-BD",
  publisher: {
    "@type": "Organization",
    name: "SellFlick POS",
  },
};

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-linear-to-br from-primary-soft/40 via-background to-warning-soft/30">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />

      {/* soft background mood */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 right-[-10%] h-[420px] w-[420px] rounded-full bg-primary/15 blur-[120px]" />
        <div className="absolute bottom-[-20%] left-[-10%] h-[420px] w-[420px] rounded-full bg-warning/15 blur-[120px]" />
      </div>

      <div className="absolute right-6 top-6 z-10">
        <ThemeToggle />
      </div>

      <section className="relative mx-auto flex min-h-screen max-w-4xl items-center px-6 py-20">
        <div className="w-full space-y-10 text-center">
          {/* soft badge */}
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/15 bg-card/80 px-5 py-2 text-xs font-medium text-primary shadow-sm">
            <span className="h-2 w-2 rounded-full bg-primary" />
            শান্তভাবে ব্যবসা চালানোর একটি উপায়
          </div>

          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-primary/80">
            SellFlick POS
          </p>

          {/* main headline */}
          <h1 className="text-4xl font-medium leading-tight text-foreground sm:text-5xl lg:text-6xl">
            বিক্রি, স্টক ও হিসাব
            <span className="block text-primary">একসাথে চালানোর POS</span>
          </h1>

          <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            হার্ডওয়্যার, ফার্মেসি, মুদি, মিষ্টির দোকান, ফুড কার্টসহ ছোট ও মাঝারি
            ব্যবসার জন্য
            <span className="block text-primary">
              দ্রুত, সহজ ও নির্ভরযোগ্য ব্যবসা ব্যবস্থাপনা
            </span>
          </p>

          {/* deeper emotional copy */}
          <p className="mx-auto max-w-xl text-muted-foreground leading-relaxed">
            এখানে কিছু জোর করে শেখানো নেই। আছে এমন একটি সিস্টেম, যা বিক্রি,
            ক্রয়, বাকি, ইনভয়েস, স্টক, ব্যাচ ও এক্সপায়ারি এক জায়গায় গুছিয়ে দেয়।
          </p>

          {/* actions */}
          <div className="flex flex-col items-center justify-center gap-4 pt-4 sm:flex-row">
            <Link
              href="/login"
              className={buttonVariants({
                size: "lg",
                className: "rounded-full px-10 shadow-lg",
              })}
            >
              শুরু করি
            </Link>

            <Link
              href="/about"
              className={buttonVariants({
                size: "lg",
                variant: "outline",
                className:
                  "rounded-full border-border bg-card/70 text-foreground/80 hover:bg-muted",
              })}
            >
              একটু বুঝে নিই
            </Link>
          </div>

          {/* closing soft line */}
          <p className="pt-8 text-sm text-muted-foreground">
            কারণ ভালো ব্যবসা মানেই শুধু লাভ নয় —
            <span className="block">মানসিক শান্তিও দরকার।</span>
          </p>
        </div>
      </section>
    </main>
  );
}

