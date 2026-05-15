import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export function LandingNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight text-foreground">
            Sell<span className="text-primary">Flick</span>
          </span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
            বাংলাদেশ
          </span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded-full bg-primary px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-hover active:scale-95"
          >
            লগইন করুন
          </Link>
        </div>
      </div>
    </header>
  );
}
