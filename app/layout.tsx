// app/layout.tsx

import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_Bengali } from "next/font/google";
import ThemeScript from "@/components/theme-script";
import QueryProvider from "@/components/providers/QueryProvider";
import ServiceWorkerRegister from "@/components/service-worker-register";
import PWAInstallPrompt from "@/components/pwa-install-prompt";
import CssHealthGuard from "@/components/css-health-guard";
import SonnerToaster from "@/components/sonner-toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoBengali = Noto_Sans_Bengali({
  variable: "--font-bengali",
  subsets: ["bengali"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://sellflickpos.com"),
  title: {
    default: "SellFlick POS | বিক্রি, স্টক, বাকি ও হিসাব সফটওয়্যার",
    template: "%s | SellFlick POS",
  },
  description:
    "বাংলাদেশের দোকান ও ব্যবসার জন্য সহজ POS সফটওয়্যার। বিক্রি, স্টক, ক্রয়, বাকি, ইনভয়েস, ব্যাচ, এক্সপায়ারি ও হিসাব একসাথে চালান SellFlick POS দিয়ে।",
  applicationName: "SellFlick POS",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "https://sellflickpos.com/",
    siteName: "SellFlick POS",
    title: "SellFlick POS | বিক্রি, স্টক, বাকি ও হিসাব সফটওয়্যার",
    description:
      "বাংলাদেশের দোকান ও ব্যবসার জন্য সহজ POS সফটওয়্যার। বিক্রি, স্টক, ক্রয়, বাকি, ইনভয়েস, ব্যাচ, এক্সপায়ারি ও হিসাব একসাথে চালান SellFlick POS দিয়ে।",
    locale: "bn_BD",
    images: [
      {
        url: "/icons/icon-512x512.png?v=20260418",
        width: 512,
        height: 512,
        alt: "SellFlick POS",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SellFlick POS | বিক্রি, স্টক, বাকি ও হিসাব সফটওয়্যার",
    description:
      "বাংলাদেশের দোকান ও ব্যবসার জন্য সহজ POS সফটওয়্যার। বিক্রি, স্টক, ক্রয়, বাকি, ইনভয়েস, ব্যাচ, এক্সপায়ারি ও হিসাব একসাথে চালান SellFlick POS দিয়ে।",
    images: ["/icons/icon-512x512.png?v=20260418"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png?v=20260418", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512x512.png?v=20260418", type: "image/png", sizes: "512x512" },
    ],
    shortcut: ["/icons/icon-192x192.png?v=20260418"],
    apple: [{ url: "/icons/icon-192x192.png?v=20260418", sizes: "192x192" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="bn" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoBengali.variable} antialiased min-h-screen bg-background text-foreground`}
        suppressHydrationWarning
      >
        <QueryProvider>
          <TooltipProvider delayDuration={300}>
            <ServiceWorkerRegister />
            <CssHealthGuard />
            <PWAInstallPrompt />
            <SonnerToaster />
            {children}
          </TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
