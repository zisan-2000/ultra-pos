// app/layout.tsx

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ServiceWorkerRegister from "@/components/service-worker-register";
import SyncBootstrap from "@/components/sync-bootstrap";
import ThemeScript from "@/components/theme-script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "আল্ট্রা পিওএস - দোকানের হিসাব",
  description: "ছোট দোকানের জন্য সহজ বিক্রি ও হিসাব ব্যবস্থাপনা",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background text-foreground`}
        style={{ fontFamily: "'SutonnyMJ', 'Noto Sans Bengali', sans-serif" }}
        suppressHydrationWarning
      >
        <ServiceWorkerRegister />
        <SyncBootstrap />
        {children}
      </body>
    </html>
  );
}
