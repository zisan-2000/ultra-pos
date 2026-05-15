import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="border-t border-border/50 bg-muted/30 py-10">
      <div className="mx-auto max-w-6xl px-5">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-foreground">
              Sell<span className="text-primary">Flick</span>
            </span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
              বাংলাদেশ
            </span>
          </div>

          {/* Links */}
          <nav className="flex items-center gap-5 text-sm text-muted-foreground">
            <Link href="/about" className="hover:text-foreground transition-colors">
              সম্পর্কে
            </Link>
            <Link href="/login" className="hover:text-foreground transition-colors">
              লগইন
            </Link>
          </nav>

          {/* Copyright */}
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} SellFlick · বাংলাদেশ
          </p>
        </div>

        {/* SEO note */}
        <p className="mt-6 text-center text-[11px] text-muted-foreground/60">
          SellFlick POS · অনেকে{" "}
          <span className="text-muted-foreground">Sell Flick</span> বা{" "}
          <span className="text-muted-foreground">SellFlickPOS</span> নামেও খোঁজেন
        </p>
      </div>
    </footer>
  );
}
