// app/layout.tsx

import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_Bengali } from "next/font/google";
import ThemeScript from "@/components/theme-script";
import QueryProvider from "@/components/providers/QueryProvider";
import ServiceWorkerRegister from "@/components/service-worker-register";
import PWAInstallPrompt from "@/components/pwa-install-prompt";
import CssHealthGuard from "@/components/css-health-guard";
import SonnerToaster from "@/components/sonner-toaster";
import OfflineSessionGuard from "@/components/offline-session-guard";
import OfflineCapabilityGuard from "@/components/offline-capability-guard";
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
  title: "আল্ট্রা পিওএস - দোকানের হিসাব",
  description: "ছোট দোকানের জন্য সহজ বিক্রি ও হিসাব ব্যবস্থাপনা",
  manifest: "/manifest.webmanifest",
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
          <OfflineSessionGuard />
          <OfflineCapabilityGuard />
          <ServiceWorkerRegister />
          <CssHealthGuard />
          <PWAInstallPrompt />
          <SonnerToaster />
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
