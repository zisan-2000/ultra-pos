// app/dashboard/cash/new/CashFormClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { db } from "@/lib/dexie/db";
import { queueAdd } from "@/lib/sync/queue";
import Link from "next/link";

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

type CashTemplate = {
  entryType: "IN" | "OUT";
  amount: string;
  reason?: string;
  count: number;
  lastUsed: number;
};

type Props = {
  shopId: string;
  backHref: string;
  action: (formData: FormData) => Promise<void>;
  id?: string;
  title?: string;
  subtitle?: string;
  shopName?: string | null;
  initialValues?: {
    entryType?: "IN" | "OUT";
    amount?: string;
    reason?: string;
  };
  submitLabel?: string;
};

const TEMPLATE_LIMIT = 40;

function mergeTemplates(existing: CashTemplate[], incoming: CashTemplate) {
  const idx = existing.findIndex(
    (t) => t.entryType === incoming.entryType && t.reason === incoming.reason
  );
  const next = [...existing];
  if (idx >= 0) {
    const current = next[idx];
    next[idx] = {
      ...current,
      amount: incoming.amount || current.amount,
      reason: incoming.reason || current.reason,
      count: current.count + 1,
      lastUsed: incoming.lastUsed,
    };
  } else {
    next.unshift(incoming);
  }
  return next
    .sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed)
    .slice(0, TEMPLATE_LIMIT);
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function parseAmount(text: string) {
  const match = text.match(/(\d+(?:[.,]\d+)?)/);
  return match ? match[1].replace(",", "") : "";
}

export default function CashFormClient({
  shopId,
  backHref,
  action,
  id,
  title,
  subtitle,
  shopName,
  initialValues,
  submitLabel = "+ দ্রুত ক্যাশ এন্ট্রি করুন",
}: Props) {
  const online = useOnlineStatus();
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [listeningField, setListeningField] = useState<"amount" | "reason" | null>(null);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const storageKey = useMemo(() => `cashTemplates:${shopId}`, [shopId]);
  const [templates, setTemplates] = useState<CashTemplate[]>([]);

  const [entryType, setEntryType] = useState<"IN" | "OUT">(initialValues?.entryType || "IN");
  const [amount, setAmount] = useState(initialValues?.amount || "");
  const [reason, setReason] = useState(initialValues?.reason || "");

  useEffect(() => {
    const SpeechRecognitionImpl =
      typeof window !== "undefined"
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;
    setVoiceReady(Boolean(SpeechRecognitionImpl));
    return () => recognitionRef.current?.stop?.();
  }, []);

  useEffect(() => {
    if (!storageKey) return;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        setTemplates(JSON.parse(stored) as CashTemplate[]);
      } catch {
        setTemplates([]);
      }
    }
  }, [storageKey]);

  const frequentTemplates = useMemo(
    () => templates.slice().sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed),
    [templates]
  );

  const recentTemplates = useMemo(
    () => templates.slice().sort((a, b) => b.lastUsed - a.lastUsed),
    [templates]
  );

  const reasonOptions = useMemo(
    () =>
      dedupe([
        ...frequentTemplates.map((t) => t.reason || ""),
        ...recentTemplates.map((t) => t.reason || ""),
        "বিক্রয়",
        "ক্যাশ আনা",
        "ক্যাশ নেওয়া",
        "পে",
        "রিকশা",
      ]),
    [frequentTemplates, recentTemplates]
  );

  const amountOptions = useMemo(
    () => dedupe(recentTemplates.map((t) => t.amount).concat(frequentTemplates.map((t) => t.amount))),
    [recentTemplates, frequentTemplates]
  );

  const headerTitle = title || (id ? "ক্যাশ এন্ট্রি সম্পাদনা" : "নতুন ক্যাশ এন্ট্রি");
  const headerSubtitle =
    subtitle ||
    (id
      ? "ভয়েস ও টেমপ্লেট দিয়ে দ্রুত পরিবর্তন করুন"
      : "ভয়েস + স্মার্ট টেমপ্লেট দিয়ে দ্রুত এন্ট্রি করুন");
  const shopLabel = shopName?.trim() || "";
  const voiceErrorText = voiceError ? `(${voiceError})` : "";
  const isListeningAmount = listeningField === "amount";
  const isListeningReason = listeningField === "reason";
  const amountVoiceHint = isListeningAmount
    ? "শুনছি... পরিমাণ বলুন"
    : voiceReady
    ? "ভয়েসে বললে অটো পূরণ হবে"
    : "এই ডিভাইসে ভয়েস সাপোর্ট নেই";
  const reasonVoiceHint = isListeningReason
    ? "শুনছি... কারণ বলুন"
    : voiceReady
    ? "ভয়েসে কারণ বলুন"
    : "এই ডিভাইসে ভয়েস সাপোর্ট নেই";

  function persistTemplates(next: CashTemplate[]) {
    setTemplates(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }

  function applyTemplate(t: CashTemplate) {
    setEntryType(t.entryType);
    setAmount(t.amount);
    setReason(t.reason || "");
  }

  function startVoice(field: "amount" | "reason") {
    if (listeningField === field) return;
    if (listeningField) stopVoice();
    const SpeechRecognitionImpl =
      typeof window !== "undefined"
        ? ((window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition)
        : null;

    if (!SpeechRecognitionImpl) {
      setVoiceReady(false);
      setVoiceError("ব্রাউজার মাইক্রোফোন সমর্থন দিচ্ছে না");
      return;
    }

    const recognition: SpeechRecognitionInstance = new SpeechRecognitionImpl();
    recognition.lang = "bn-BD";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onerror = () => {
      setListeningField(null);
      setVoiceError("মাইক্রোফোন অ্যাক্সেস পাওয়া যায়নি");
    };
    recognition.onend = () => setListeningField(null);
    recognition.onresult = (event: any) => {
      const spoken: string | undefined = event?.results?.[0]?.[0]?.transcript;
      if (spoken) {
        if (field === "amount") {
          const parsed = parseAmount(spoken);
          if (parsed) setAmount(parsed);
          const leftover = parsed ? spoken.replace(parsed, "").trim() : spoken;
          if (leftover && !reason) setReason(leftover);
        } else {
          setReason((prev) => (prev ? `${prev} ${spoken}` : spoken));
          const parsed = parseAmount(spoken);
          if (parsed && !amount) setAmount(parsed);
        }
      }
      setListeningField(null);
    };

    recognitionRef.current = recognition;
    setVoiceError(null);
    setListeningField(field);
    recognition.start();
  }

  function stopVoice() {
    recognitionRef.current?.stop?.();
    setListeningField(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);

    form.set("entryType", (form.get("entryType") as string) || entryType);
    form.set("amount", (form.get("amount") as string) || amount);
    form.set("reason", (form.get("reason") as string) || reason);

    if (!initialValues) {
      const template: CashTemplate = {
        entryType: (form.get("entryType") as "IN" | "OUT") || entryType,
        amount: (form.get("amount") as string) || "0",
        reason: (form.get("reason") as string) || "",
        count: 1,
        lastUsed: Date.now(),
      };
      persistTemplates(mergeTemplates(templates, template));
    }

    if (online) {
      await action(form);
      return;
    }

    const isEdit = Boolean(id);
    const entryId = id || crypto.randomUUID();
    const payload = {
      id: entryId,
      shopId,
      entryType: (form.get("entryType") as "IN" | "OUT") || "IN",
      amount: form.get("amount") as string,
      reason: (form.get("reason") as string) || "",
      createdAt: Date.now(),
      syncStatus: isEdit ? "updated" as const : "new" as const,
    };

    await db.cash.put(payload as any);
    await queueAdd("cash", isEdit ? "update" : "create", payload);
    alert(
      isEdit
        ? "Offline: ক্যাশ এন্ট্রি আপডেট কিউ হয়েছে, সংযোগ পেলে সিঙ্ক হবে।"
        : "Offline: ক্যাশ এন্ট্রি সংরক্ষিত, সংযোগ পেলে সিঙ্ক হবে।"
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_16px_36px_rgba(15,23,42,0.08)] animate-fade-in">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-soft/60 via-card to-card" />
        <div className="pointer-events-none absolute -top-16 right-0 h-40 w-40 rounded-full bg-success/20 blur-3xl" />
        <div className="relative space-y-3 p-4">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              ক্যাশ
            </p>
            <h1 className="text-2xl font-bold text-foreground leading-tight tracking-tight sm:text-3xl">
              {headerTitle}
            </h1>
            <p className="text-sm text-muted-foreground">{headerSubtitle}</p>
            {shopLabel ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
                দোকান:
                <span className="truncate font-semibold text-foreground">
                  {shopLabel}
                </span>
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex h-7 items-center gap-1 rounded-full bg-card/80 px-3 font-semibold text-foreground border border-border shadow-[0_1px_0_rgba(0,0,0,0.03)]">
              ভয়েস ইনপুট
            </span>
            <span className="inline-flex h-7 items-center gap-1 rounded-full bg-card/80 px-3 font-semibold text-muted-foreground border border-border">
              টেমপ্লেট
            </span>
            <span
              className={`inline-flex h-7 items-center gap-1 rounded-full px-3 font-semibold border ${
                online
                  ? "bg-success-soft text-success border-success/30"
                  : "bg-danger-soft text-danger border-danger/30"
              }`}
            >
              {online ? "অনলাইন" : "অফলাইন"}
            </span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Entry Type */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-base font-medium text-foreground">
              ক্যাশ টাইপ *
            </label>
            <span className="text-xs text-muted-foreground">ইন/আউট</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setEntryType("IN")}
              className={`h-11 rounded-full border px-4 text-sm font-semibold transition ${
                entryType === "IN"
                  ? "bg-success-soft border-success/30 text-success shadow-sm"
                  : "bg-card border-border text-foreground hover:border-success/40"
              }`}
            >
              + ক্যাশ ইন
            </button>
            <button
              type="button"
              onClick={() => setEntryType("OUT")}
              className={`h-11 rounded-full border px-4 text-sm font-semibold transition ${
                entryType === "OUT"
                  ? "bg-danger-soft border-danger/30 text-danger shadow-sm"
                  : "bg-card border-border text-foreground hover:border-danger/40"
              }`}
            >
              - ক্যাশ আউট
            </button>
          </div>
          <input type="hidden" name="entryType" value={entryType} />
          <p className="text-xs text-muted-foreground">
            সর্বশেষ ব্যবহৃত টাইপ নির্বাচিত থাকে
          </p>
        </div>

        {/* Amount */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-base font-medium text-foreground">
              পরিমাণ (৳) *
            </label>
            <span className="text-xs text-muted-foreground">ভয়েস/সাজেশন</span>
          </div>
          <div className="relative">
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full h-12 border border-border rounded-xl px-4 pr-16 text-base bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="যেমন: 500, 1000.50"
              required
            />
            <button
              type="button"
              onClick={isListeningAmount ? stopVoice : () => startVoice("amount")}
              disabled={!voiceReady}
              aria-label={isListeningAmount ? "ভয়েস বন্ধ করুন" : "ভয়েস ইনপুট চালু করুন"}
              className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${
                isListeningAmount
                  ? "bg-primary-soft text-primary border-primary/40 animate-pulse"
                  : "bg-primary-soft text-primary border-primary/30 active:scale-95"
              } ${!voiceReady ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              {isListeningAmount ? "🔴" : "🎤"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {amountVoiceHint}{" "}
            {voiceErrorText ? (
              <span className="text-danger">{voiceErrorText}</span>
            ) : null}
          </p>
          {amountOptions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {amountOptions.slice(0, 6).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAmount(a)}
                  className="h-9 px-3 rounded-full border border-primary/30 bg-primary-soft/80 text-primary text-xs font-semibold hover:border-primary/50"
                >
                  ৳ {a}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Reason */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-2">
          <label className="block text-base font-medium text-foreground">
            কারণ (ঐচ্ছিক)
          </label>
          <div className="relative">
            <input
              name="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full h-12 border border-border rounded-xl px-4 pr-16 text-base bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="যেমন: বিক্রয় টাকা, মালিককে ক্যাশ"
            />
            <button
              type="button"
              onClick={isListeningReason ? stopVoice : () => startVoice("reason")}
              disabled={!voiceReady}
              aria-label={isListeningReason ? "ভয়েস বন্ধ করুন" : "ভয়েস ইনপুট চালু করুন"}
              className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${
                isListeningReason
                  ? "bg-primary-soft text-primary border-primary/40 animate-pulse"
                  : "bg-primary-soft text-primary border-primary/30 active:scale-95"
              } ${!voiceReady ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              {isListeningReason ? "🔴" : "🎤"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {reasonVoiceHint}{" "}
            {voiceErrorText ? (
              <span className="text-danger">{voiceErrorText}</span>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-2">
            {reasonOptions.slice(0, 6).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className="h-9 px-3 rounded-full border border-border bg-card text-xs font-semibold text-foreground hover:border-primary/30"
              >
                {r}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            বেশি ব্যবহৃত কারণগুলো এক ট্যাপে পাওয়া যাবে
          </p>
        </div>

        {/* Recent templates */}
        {recentTemplates.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">
                রিসেন্ট ক্যাশ
              </h3>
              <span className="text-xs text-muted-foreground">
                এক ট্যাপে অটো-ফিল
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {recentTemplates.slice(0, 4).map((t) => {
                const isIn = t.entryType === "IN";
                return (
                  <button
                    key={`${t.entryType}-${t.amount}-${t.lastUsed}`}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    className="flex items-center justify-between gap-3 bg-card border border-border rounded-xl px-3 py-2 text-left shadow-sm hover:border-primary/40 transition-colors"
                  >
                    <div>
                      <p
                        className={`text-xs font-semibold ${
                          isIn ? "text-success" : "text-danger"
                        }`}
                      >
                        {isIn ? "ক্যাশ ইন" : "ক্যাশ আউট"}
                      </p>
                      <p className="text-sm font-semibold text-foreground">
                        {t.reason || "কারণ নেই"}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-primary">
                      ৳ {t.amount}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              className="flex-1 h-14 sm:h-12 rounded-xl bg-gradient-to-r from-primary to-primary-hover text-primary-foreground border border-primary/40 text-base font-semibold shadow-[0_12px_22px_rgba(22,163,74,0.28)] transition hover:brightness-105 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {submitLabel}
            </button>
            <Link
              href={backHref}
              className="flex-1 h-14 sm:h-12 rounded-xl border border-border text-foreground text-base font-semibold hover:bg-muted transition text-center flex items-center justify-center"
            >
              পিছনে যান
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
