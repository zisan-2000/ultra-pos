import { Mail, MessageCircle, Clock, Phone } from "lucide-react";

const WHATSAPP_NUMBER = "8801700000000";
const SUPPORT_EMAIL = "support@sellflickpos.com";
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("হ্যালো, আমি SellFlick সম্পর্কে জানতে চাই।")}`;

export function LandingSupport() {
  return (
    <section id="support" className="py-20">
      <div className="mx-auto max-w-3xl px-5">
        {/* Header */}
        <div className="mb-10 text-center">
          <p className="mb-3 text-sm font-bold uppercase tracking-widest text-primary">
            সাপোর্ট
          </p>
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
            যেকোনো প্রশ্নে আমরা{" "}
            <span className="text-primary">পাশে আছি</span>
          </h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            নতুন অ্যাকাউন্ট থেকে শুরু করে দৈনিক সমস্যা — সব প্রশ্নের উত্তর দেওয়া হয়।
          </p>
        </div>

        {/* WhatsApp — hero CTA */}
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="group mb-4 flex w-full flex-col items-center gap-5 overflow-hidden rounded-3xl border-2 border-emerald-400/60 bg-gradient-to-br from-emerald-50 via-emerald-50/60 to-card px-8 py-10 shadow-[0_8px_32px_rgba(16,185,129,0.18)] transition hover:border-emerald-500 hover:shadow-[0_12px_40px_rgba(16,185,129,0.28)] active:scale-[0.99] dark:border-emerald-700/60 dark:from-emerald-950/50 dark:via-emerald-950/20 dark:to-card"
        >
          {/* WhatsApp icon */}
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_8px_24px_rgba(16,185,129,0.45)] transition group-hover:scale-105 group-hover:shadow-[0_12px_32px_rgba(16,185,129,0.55)]">
            <MessageCircle className="h-10 w-10" strokeWidth={1.8} />
          </div>

          {/* Text */}
          <div className="text-center">
            <p className="mb-1 text-xl font-bold text-foreground">WhatsApp-এ সরাসরি মেসেজ দিন</p>
            <p className="mb-3 text-muted-foreground">
              নতুন অ্যাকাউন্ট, setup সাহায্য বা যেকোনো প্রশ্নের জন্য
            </p>
            <p className="text-2xl font-bold tracking-wide text-emerald-600 dark:text-emerald-400">
              +880 1700-000000
            </p>
          </div>

          {/* CTA button */}
          <div className="inline-flex h-12 items-center gap-2.5 rounded-full bg-emerald-500 px-8 text-base font-bold text-white shadow-md transition group-hover:bg-emerald-600 group-active:scale-95">
            <MessageCircle className="h-5 w-5" />
            এখনই WhatsApp করুন
          </div>

          {/* Hours */}
          <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <Clock className="h-4 w-4" />
            শনি–বৃহস্পতি · সকাল ৯টা – রাত ৯টা · বাংলায় কথা বলুন
          </div>
        </a>

        {/* Email — secondary */}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="group flex items-center gap-4 rounded-2xl border border-border bg-card px-6 py-4 transition hover:border-primary/30 hover:bg-muted/50"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground transition group-hover:bg-primary/10 group-hover:text-primary">
            <Mail className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">ইমেইলে লিখুন</p>
            <p className="truncate text-sm text-muted-foreground">{SUPPORT_EMAIL}</p>
          </div>
          <span className="shrink-0 text-muted-foreground/50 transition group-hover:text-primary">→</span>
        </a>

        {/* Phone note */}
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Phone className="h-3.5 w-3.5" />
          <span>WhatsApp call-ও করা যাবে</span>
        </div>
      </div>
    </section>
  );
}
