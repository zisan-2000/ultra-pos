import {
  ShoppingCart,
  Package,
  Users,
  FileText,
  Layers,
  WifiOff,
  BarChart3,
  Receipt,
} from "lucide-react";

const features = [
  {
    icon: ShoppingCart,
    title: "দ্রুত বিক্রি (POS)",
    desc: "কয়েক সেকেন্ডে পণ্য খুঁজুন, কার্টে যোগ করুন, বিল দিন — বারকোড স্ক্যানও চলে।",
    color: "bg-primary/10 text-primary",
  },
  {
    icon: Package,
    title: "স্টক ও ক্রয় ট্র্যাকিং",
    desc: "পণ্য কতটুকু আছে, কবে কিনেছেন, কোথায় আছে — সব পরিষ্কার দেখুন।",
    color: "bg-warning/10 text-warning",
  },
  {
    icon: Users,
    title: "বাকি ও কাস্টমার হিসাব",
    desc: "কার কাছে কত বাকি আছে, কবে দেবে — সব সংরক্ষিত থাকে। SMS রিমাইন্ডারও দেওয়া যায়।",
    color: "bg-blue-500/10 text-blue-500",
  },
  {
    icon: Receipt,
    title: "ইনভয়েস ও প্রিন্ট",
    desc: "প্রতিটি বিক্রিতে স্বয়ংক্রিয় ইনভয়েস। PDF বা সরাসরি প্রিন্টে পাঠান।",
    color: "bg-purple-500/10 text-purple-500",
  },
  {
    icon: Layers,
    title: "ব্যাচ ও এক্সপায়ারি",
    desc: "ব্যাচ নম্বর ও মেয়াদ অনুযায়ী স্টক ট্র্যাক করুন — ফার্মেসি ও মুদির জন্য আদর্শ।",
    color: "bg-rose-500/10 text-rose-500",
  },
  {
    icon: WifiOff,
    title: "অফলাইনেও কাজ করে",
    desc: "নেট না থাকলেও বিক্রি চলবে। অনলাইনে ফিরলে স্বয়ংক্রিয়ভাবে সিঙ্ক হবে।",
    color: "bg-emerald-500/10 text-emerald-600",
  },
  {
    icon: BarChart3,
    title: "রিপোর্ট ও বিশ্লেষণ",
    desc: "দৈনিক, সাপ্তাহিক বিক্রি, লাভ-লোকসান, বেস্টসেলার — Excel-এ ডাউনলোডও হয়।",
    color: "bg-cyan-500/10 text-cyan-600",
  },
  {
    icon: FileText,
    title: "সহজ ড্যাশবোর্ড",
    desc: "একটাই স্ক্রিনে আজকের বিক্রি, বাকি, স্টক আলার্ট — কিছু মিস হবে না।",
    color: "bg-orange-500/10 text-orange-500",
  },
];

export function LandingFeatures() {
  return (
    <section id="features" className="bg-muted/30 py-20">
      <div className="mx-auto max-w-6xl px-5">
        {/* Header */}
        <div className="mb-12 text-center">
          <p className="mb-3 text-sm font-bold uppercase tracking-widest text-primary">
            সব ফিচার একনজরে
          </p>
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
            এক সফটওয়্যারে সব কিছু
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            আলাদা আলাদা অ্যাপ বা খাতা লাগবে না — SellFlick-এ সব একসাথে।
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-primary/30 hover:shadow-md"
            >
              <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl ${f.color}`}>
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mb-1.5 font-bold text-foreground">{f.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
