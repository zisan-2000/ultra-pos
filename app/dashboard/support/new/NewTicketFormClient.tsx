"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";

type Shop = { id: string; name: string };

type Props = {
  shops: Shop[];
  defaultShopId: string;
  action: (formData: FormData) => Promise<void>;
  backHref: string;
};

const CATEGORIES = [
  { value: "technical", label: "প্রযুক্তিগত সমস্যা" },
  { value: "billing", label: "বিলিং / পেমেন্ট" },
  { value: "feature_request", label: "নতুন ফিচার চাই" },
  { value: "other", label: "অন্যান্য" },
];

const PRIORITIES = [
  { value: "low", label: "কম গুরুত্বপূর্ণ" },
  { value: "normal", label: "সাধারণ" },
  { value: "high", label: "জরুরি" },
];

export function NewTicketFormClient({ shops, defaultShopId, action, backHref }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await action(formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "কিছু একটা ভুল হয়েছে");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href={backHref}
          className="rounded-lg p-2 hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">নতুন সাপোর্ট টিকেট</h1>
          <p className="text-sm text-muted-foreground">আপনার সমস্যা বিস্তারিত জানান</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow p-4 sm:p-6">
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          {/* Shop */}
          {shops.length > 1 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">দোকান</label>
              <select
                name="shopId"
                defaultValue={defaultShopId}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {shops.length === 1 && (
            <input type="hidden" name="shopId" value={defaultShopId} />
          )}

          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">বিভাগ</label>
            <select
              name="category"
              defaultValue="other"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">গুরুত্ব</label>
            <select
              name="priority"
              defaultValue="normal"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">শিরোনাম</label>
            <input
              name="title"
              required
              minLength={5}
              placeholder="সংক্ষেপে সমস্যাটি লিখুন"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">বিস্তারিত বিবরণ</label>
            <textarea
              name="description"
              required
              minLength={10}
              rows={5}
              placeholder="সমস্যাটি বিস্তারিত বর্ণনা করুন..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <Link
              href={backHref}
              className="flex-1 rounded-lg border border-border px-4 py-2 text-center text-sm font-medium hover:bg-muted transition-colors"
            >
              বাতিল
            </Link>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isPending ? "পাঠানো হচ্ছে..." : "টিকেট পাঠান"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
