"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export default function RegisterPage() {
  return (
    <div className="relative flex items-center justify-center min-h-screen bg-background px-4">
      <div className="absolute right-6 top-6 z-10">
        <ThemeToggle />
      </div>
      <div className="p-6 w-full max-w-md border border-border rounded-2xl space-y-4 bg-card shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold text-foreground">
            অ্যাকাউন্ট তৈরি এখন নিয়ন্ত্রিত
          </h1>
          <p className="text-sm text-muted-foreground">
            এই সিস্টেমে নতুন owner account public signup দিয়ে খোলা যায় না।
            Admin বা agent আপনার জন্য account তৈরি করবে।
          </p>
        </div>

        <div className="rounded-xl border border-border bg-muted/60 p-4 text-sm text-muted-foreground">
          <p>
            Account access দরকার হলে আপনার assigned admin বা agent-এর সাথে
            যোগাযোগ করুন।
          </p>
          <p className="mt-2">
            Existing account থাকলে login করুন বা password reset ব্যবহার করুন।
          </p>
        </div>

        <div className="flex items-center justify-between text-sm text-primary gap-4">
          <Link href="/login" className="hover:underline hover:text-primary-hover">
            লগইন পাতায় যান
          </Link>
          <Link href="/forgot-password" className="hover:underline hover:text-primary-hover">
            পাসওয়ার্ড ভুলে গেছেন?
          </Link>
        </div>
      </div>
    </div>
  );
}

