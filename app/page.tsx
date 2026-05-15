// app/page.tsx

import { LandingNav } from "@/components/landing/LandingNav";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingPainSolution } from "@/components/landing/LandingPainSolution";
import { LandingForWhom } from "@/components/landing/LandingForWhom";
import { LandingSteps } from "@/components/landing/LandingSteps";
import { LandingSupport } from "@/components/landing/LandingSupport";
import { LandingFooter } from "@/components/landing/LandingFooter";

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "SellFlick",
  alternateName: ["SellFlick POS", "Sell Flick", "SellFlickPOS", "Sell Flick POS"],
  url: "https://sellflickpos.com/",
  logo: "https://sellflickpos.com/icons/icon-512x512.png?v=20260418",
  description:
    "বাংলাদেশের দোকান ও ব্যবসার জন্য smart business system। বিক্রি, স্টক, ক্রয়, বাকি, ইনভয়েস, ব্যাচ, এক্সপায়ারি ও হিসাব একসাথে।",
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "SellFlick",
  alternateName: ["SellFlick POS", "Sell Flick", "SellFlickPOS", "Sell Flick POS"],
  url: "https://sellflickpos.com/",
  inLanguage: "bn-BD",
  publisher: { "@type": "Organization", name: "SellFlick" },
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />

      {/* Full-page soft gradient background */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-linear-to-br from-primary-soft/30 via-background to-warning-soft/20"
      >
        <div className="absolute -top-32 right-[-10%] h-125 w-125 rounded-full bg-primary/12 blur-[130px]" />
        <div className="absolute bottom-[-20%] left-[-10%] h-105 w-105 rounded-full bg-warning/10 blur-[120px]" />
      </div>

      <LandingNav />

      <main>
        <LandingHero />
        <LandingPainSolution />
        <LandingForWhom />
        <LandingSteps />
        <LandingSupport />
      </main>

      <LandingFooter />
    </>
  );
}
