// app/page.tsx

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-linear-to-br from-amber-50/70 via-white to-emerald-50/70">
      {/* soft background mood */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 right-[-10%] h-[420px] w-[420px] rounded-full bg-emerald-200/30 blur-[120px]" />
        <div className="absolute bottom-[-20%] left-[-10%] h-[420px] w-[420px] rounded-full bg-amber-200/40 blur-[120px]" />
      </div>

      <section className="relative mx-auto flex min-h-screen max-w-4xl items-center px-6 py-20">
        <div className="w-full space-y-10 text-center">
          {/* soft badge */}
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white/80 px-5 py-2 text-xs font-medium text-emerald-700 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            শান্তভাবে ব্যবসা চালানোর একটি উপায়
          </div>

          {/* main headline */}
          <h1 className="text-4xl font-medium leading-tight text-slate-900 sm:text-5xl lg:text-6xl">
            ব্যবসা এমন হওয়া উচিত,
            <span className="block text-emerald-700">
              যা আপনাকে ক্লান্ত না করে
            </span>
          </h1>

          {/* emotional paragraph */}
          <p className="mx-auto max-w-2xl text-lg leading-relaxed text-slate-600 sm:text-xl">
            সারাদিনের দৌড়ঝাঁপের পর হিসাব নিয়ে চিন্তা না করেই যদি নিশ্চিন্তে
            দোকান বন্ধ করা যেত—
            <br />
            <span className="text-slate-800 font-medium">
              এই POS ঠিক সেই জায়গাটুকুই সামলায়।
            </span>
          </p>

          {/* deeper emotional copy */}
          <p className="mx-auto max-w-xl text-slate-500 leading-relaxed">
            এখানে কিছু জোর করে শেখানো নেই। আছে শুধু এমন একটা সিস্টেম— যা ধীরে
            ধীরে আপনার কাজ বুঝে নেয়, আর আপনাকে সময় দেয় নিজের ব্যবসার দিকে
            তাকানোর।
          </p>

          {/* actions */}
          <div className="flex flex-col items-center justify-center gap-4 pt-4 sm:flex-row">
            <Link
              href="/login"
              className={buttonVariants({
                size: "lg",
                className: "rounded-full px-10 shadow-xl shadow-emerald-200/70",
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
                  "rounded-full border-emerald-200 bg-white/70 text-slate-700 hover:bg-emerald-50",
              })}
            >
              একটু বুঝে নিই
            </Link>
          </div>

          {/* closing soft line */}
          <p className="pt-8 text-sm text-slate-400">
            কারণ ভালো ব্যবসা মানেই শুধু লাভ নয় —
            <span className="block">মানসিক শান্তিও দরকার।</span>
          </p>
        </div>
      </section>
    </main>
  );
}
