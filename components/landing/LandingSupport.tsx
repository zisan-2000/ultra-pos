import { MessageCircle, Clock, Phone, ShieldCheck } from "lucide-react";

type Contact = {
  supportPhone: string | null;
  supportWhatsapp: string | null;
};

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function formatBdPhone(value: string) {
  // Pretty-print a Bangladeshi phone number: +880 1XXX-XXXXXX
  const digits = digitsOnly(value);
  if (digits.length >= 13 && digits.startsWith("880")) {
    const local = digits.slice(3);
    return `+880 ${local.slice(0, 4)}-${local.slice(4)}`;
  }
  if (digits.length === 11 && digits.startsWith("01")) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  return value;
}

export function LandingSupport({ contact }: { contact?: Contact | null }) {
  const phone = contact?.supportPhone?.trim() || null;
  const whatsapp = contact?.supportWhatsapp?.trim() || null;

  const phoneHref = phone ? `tel:${phone.replace(/\s/g, "")}` : null;
  const whatsappHref = whatsapp
    ? `https://wa.me/${digitsOnly(whatsapp)}?text=${encodeURIComponent(
        "হ্যালো, আমি SellFlick সম্পর্কে জানতে চাই।"
      )}`
    : null;

  const hasAny = Boolean(phone || whatsapp);

  return (
    <section
      id="support"
      className="relative overflow-hidden py-16 lg:py-24"
    >
      {/* Section-specific animated shade — success/whatsapp tone */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-10 h-72 w-72 -translate-x-1/2 rounded-full bg-success/15 blur-[110px] animate-blob-c" />
        <div className="absolute bottom-0 right-[10%] h-56 w-56 rounded-full bg-primary/10 blur-[90px] animate-blob-a" />
      </div>

      <div className="mx-auto max-w-3xl px-5">
        {/* Header */}
        <div className="mb-10 text-center lg:mb-12">
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

        {hasAny ? (
          <>
            {/* WhatsApp — hero CTA (if available) */}
            {whatsappHref && whatsapp && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative mb-4 flex w-full flex-col items-center gap-5 overflow-hidden rounded-3xl border-2 border-success/40 bg-linear-to-br from-success-soft/70 via-success-soft/40 to-card px-6 py-8 shadow-[0_8px_32px_rgba(16,185,129,0.18)] transition hover:border-success/60 hover:shadow-[0_16px_48px_rgba(16,185,129,0.32)] active:scale-[0.99] sm:px-8 sm:py-10"
              >
                {/* Glow circle behind icon */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-10 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-success/25 blur-[60px] animate-blob-pulse"
                />

                {/* WhatsApp icon */}
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-success text-white shadow-[0_8px_24px_rgba(16,185,129,0.45)] transition group-hover:scale-105 group-hover:shadow-[0_12px_32px_rgba(16,185,129,0.55)] animate-float-y">
                  <MessageCircle className="h-10 w-10" strokeWidth={1.8} />
                </div>

                {/* Text */}
                <div className="text-center">
                  <p className="mb-1 text-xl font-bold text-foreground">
                    WhatsApp-এ সরাসরি মেসেজ দিন
                  </p>
                  <p className="mb-3 text-muted-foreground">
                    নতুন অ্যাকাউন্ট, setup সাহায্য বা যেকোনো প্রশ্নের জন্য
                  </p>
                  <p className="text-2xl font-bold tracking-wide text-success">
                    {formatBdPhone(whatsapp)}
                  </p>
                </div>

                {/* CTA button */}
                <div className="inline-flex h-12 items-center gap-2.5 rounded-full bg-success px-8 text-base font-bold text-white shadow-md transition group-hover:brightness-105 group-active:scale-95">
                  <MessageCircle className="h-5 w-5" />
                  এখনই WhatsApp করুন
                </div>

                {/* Hours */}
                <div className="flex items-center gap-2 text-sm text-success">
                  <Clock className="h-4 w-4" />
                  শনি–বৃহস্পতি · সকাল ৯টা – রাত ৯টা · বাংলায় কথা বলুন
                </div>
              </a>
            )}

            {/* Phone — secondary (if available) */}
            {phoneHref && phone && (
              <a
                href={phoneHref}
                className="group flex items-center gap-4 rounded-2xl border border-border bg-card/80 px-6 py-4 backdrop-blur transition hover:border-primary/30 hover:bg-muted/50 hover:shadow-md"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary transition group-hover:scale-105 group-hover:bg-primary group-hover:text-white">
                  <Phone className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-foreground">কল করুন</p>
                  <p className="truncate text-sm font-semibold tracking-wide text-muted-foreground">
                    {formatBdPhone(phone)}
                  </p>
                </div>
                <span className="shrink-0 text-lg text-muted-foreground/50 transition group-hover:translate-x-1 group-hover:text-primary">
                  →
                </span>
              </a>
            )}

            {/* Trust strip */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-success" />
                বাংলায় কথা বলুন
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-primary" />
                দ্রুত response
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MessageCircle className="h-3.5 w-3.5 text-success" />
                WhatsApp call-ও করা যাবে
              </span>
            </div>
          </>
        ) : (
          // Fallback — admin has not configured contact yet
          <div className="rounded-3xl border border-border bg-card/80 px-6 py-10 text-center shadow-sm backdrop-blur">
            <div className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft">
              <MessageCircle className="h-6 w-6 text-primary" />
            </div>
            <p className="text-base font-bold text-foreground">
              সাপোর্ট কন্টাক্ট শীঘ্রই যোগ হবে
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              এখনো contact number সেট করা হয়নি। অনুগ্রহ করে কিছুক্ষণ পরে আবার চেষ্টা
              করুন।
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
