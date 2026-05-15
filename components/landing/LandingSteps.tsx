import Link from "next/link";

const steps = [
  {
    step: "০১",
    title: "অ্যাকাউন্ট নিন",
    desc: "আমাদের সাথে যোগাযোগ করুন বা নিচের WhatsApp-এ মেসেজ দিন। আমরা আপনার অ্যাকাউন্ট তৈরি করে দেব।",
  },
  {
    step: "০২",
    title: "দোকান সেটআপ করুন",
    desc: "দোকানের নাম, পণ্য ও স্টক যোগ করুন। মাত্র কয়েক মিনিটেই শেষ। কোনো টেকনিক্যাল জ্ঞান লাগবে না।",
  },
  {
    step: "০৩",
    title: "বিক্রি শুরু করুন",
    desc: "POS স্ক্রিনে পণ্য ট্যাপ করুন, বিল দিন। রিপোর্ট দেখুন, হিসাব রাখুন — সব তৈরি।",
  },
];

export function LandingSteps() {
  return (
    <section className="bg-gradient-to-br from-primary/5 via-background to-warning/5 py-20">
      <div className="mx-auto max-w-6xl px-5">
        {/* Header */}
        <div className="mb-12 text-center">
          <p className="mb-3 text-sm font-bold uppercase tracking-widest text-primary">
            কীভাবে শুরু করবেন
          </p>
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
            মাত্র ৩ ধাপে চালু
          </h2>
        </div>

        {/* Steps */}
        <div className="relative grid grid-cols-1 gap-6 sm:grid-cols-3">
          {/* Connector line — desktop only */}
          <div
            aria-hidden
            className="absolute left-0 right-0 top-8 hidden h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent sm:block"
          />

          {steps.map((s, i) => (
            <div key={s.step} className="relative flex flex-col items-center text-center">
              {/* Number circle */}
              <div className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary/30 bg-card shadow-[0_0_0_6px_rgba(22,163,74,0.07)]">
                <span className="text-lg font-bold text-primary">{s.step}</span>
                {/* Arrow between steps */}
                {i < steps.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute -right-8 top-1/2 hidden -translate-y-1/2 text-xl text-primary/40 sm:block"
                  >
                    →
                  </span>
                )}
              </div>
              <h3 className="mb-2 text-lg font-bold text-foreground">{s.title}</h3>
              <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <Link
            href="/login"
            className="inline-flex h-12 items-center rounded-full bg-gradient-to-r from-primary to-primary-hover px-10 text-base font-bold text-white shadow-[0_8px_22px_rgba(22,163,74,0.35)] transition hover:brightness-105 active:scale-95"
          >
            এখনই শুরু করুন →
          </Link>
        </div>
      </div>
    </section>
  );
}
