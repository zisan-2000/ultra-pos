// app/about/page.tsx

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function AboutPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <div className="space-y-6">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-4 py-1 text-xs font-semibold text-muted-foreground">
          About this POS
        </div>
        <h1 className="text-3xl font-bold text-foreground sm:text-4xl">
          A calmer way to run your shop
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          This system focuses on simple daily work: sales, stock, cash, and
          reports. It is designed to be fast on low-end devices, work well in
          unstable internet, and keep the flow easy for staff.
        </p>
        <p className="text-base leading-relaxed text-muted-foreground">
          If you want a guided walkthrough, sign in and explore the dashboard.
          You can create a shop, add products, and see reports in minutes.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/login"
            className={buttonVariants({ size: "lg" })}
          >
            Get started
          </Link>
          <Link
            href="/"
            className={buttonVariants({ size: "lg", variant: "outline" })}
          >
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
