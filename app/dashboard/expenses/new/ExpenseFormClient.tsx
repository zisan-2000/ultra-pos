// app/dashboard/expenses/new/ExpenseFormClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useRealtimeStatus } from "@/lib/realtime/status";
import { db } from "@/lib/dexie/db";
import { queueAdd } from "@/lib/sync/queue";
import useRealTimeReports from "@/hooks/useRealTimeReports";
import { emitExpenseUpdate } from "@/lib/events/reportEvents";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";
import Link from "next/link";
import { toast } from "sonner";

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

type ExpenseTemplate = {
  category: string;
  amount: string;
  note?: string;
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
    amount?: string;
    category?: string;
    note?: string;
    expenseDate?: string;
  };
  submitLabel?: string;
};

const TEMPLATE_LIMIT = 40;

const CATEGORY_SUGGESTIONS = ["ভাড়া", "বিদ্যুৎ", "কাঁচা বাজার", "বেতন", "পরিবহন", "অন্যান্য"];

function mergeTemplates(existing: ExpenseTemplate[], incoming: ExpenseTemplate) {
  const idx = existing.findIndex((t) => t.category === incoming.category && t.amount === incoming.amount);
  const next = [...existing];
  if (idx >= 0) {
    const current = next[idx];
    next[idx] = {
      ...current,
      note: incoming.note || current.note,
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

function isRedirectError(err: unknown) {
  if (!err || typeof err !== "object") return false;
  const digest = (err as { digest?: string }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export default function ExpenseFormClient({
  shopId,
  backHref,
  action,
  id,
  title,
  subtitle,
  shopName,
  initialValues,
  submitLabel = "+ দ্রুত খরচ যোগ করুন",
}: Props) {
  // World-Class Real-time Reports Integration
  const realTimeReports = useRealTimeReports(shopId);
  
  const online = useOnlineStatus();
  const realtime = useRealtimeStatus();
  const router = useRouter();
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const storageKey = useMemo(() => `expenseTemplates:${shopId}`, [shopId]);
  const [templates, setTemplates] = useState<ExpenseTemplate[]>([]);

  const [amount, setAmount] = useState(initialValues?.amount || "");
  const [category, setCategory] = useState(initialValues?.category || "");
  const [note, setNote] = useState(initialValues?.note || "");
  const [expenseDate, setExpenseDate] = useState(
    initialValues?.expenseDate || new Date().toISOString().slice(0, 10)
  );

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
    const stored = safeLocalStorageGet(storageKey);
    if (stored) {
      try {
        setTemplates(JSON.parse(stored) as ExpenseTemplate[]);
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

  const categoryOptions = useMemo(
    () =>
      dedupe([
        ...CATEGORY_SUGGESTIONS,
        ...frequentTemplates.map((t) => t.category),
        ...recentTemplates.map((t) => t.category),
      ]),
    [frequentTemplates, recentTemplates]
  );

  const amountOptions = useMemo(
    () => dedupe(recentTemplates.map((t) => t.amount).concat(frequentTemplates.map((t) => t.amount))),
    [recentTemplates, frequentTemplates]
  );

  const headerTitle = title || (id ? "খরচ সম্পাদনা করুন" : "নতুন খরচ যোগ করুন");
  const headerSubtitle =
    subtitle ||
    (id
      ? "পরিমাণ, ক্যাটাগরি ও নোট ঠিক করে আপডেট করুন"
      : "ভয়েস + স্মার্ট টেমপ্লেট দিয়ে দ্রুত খরচ যোগ করুন");
  const shopLabel = shopName?.trim() || "";
  const voiceErrorText = voiceError ? `(${voiceError})` : "";
  const amountVoiceHint = listening
    ? "শুনছি... খরচের নাম/দাম বলুন"
    : voiceReady
    ? "ভয়েসে বললে অটো পূরণ হবে"
    : "এই ডিভাইসে ভয়েস সাপোর্ট নেই";
  const noteVoiceHint = listening
    ? "শুনছি... নোট বলুন"
    : voiceReady
    ? "ভয়েসে নোট বলুন"
    : "এই ডিভাইসে ভয়েস সাপোর্ট নেই";

  function persistTemplates(next: ExpenseTemplate[]) {
    setTemplates(next);
    safeLocalStorageSet(storageKey, JSON.stringify(next));
  }

  function applyTemplate(t: ExpenseTemplate) {
    setCategory(t.category);
    setAmount(t.amount);
    setNote(t.note || "");
  }

  function startVoice(field: "amount" | "note") {
    if (listening) return;
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
      setListening(false);
      setVoiceError("মাইক্রোফোন অ্যাক্সেস পাওয়া যায়নি");
    };
    recognition.onend = () => setListening(false);
    recognition.onresult = (event: any) => {
      const spoken: string | undefined = event?.results?.[0]?.[0]?.transcript;
      if (spoken) {
        if (field === "amount") {
          const parsed = parseAmount(spoken);
          if (parsed) setAmount(parsed);
          // also capture note text if included
          const leftover = parsed ? spoken.replace(parsed, "").trim() : spoken;
          if (leftover && !note) setNote(leftover);
        } else {
          setNote((prev) => (prev ? `${prev} ${spoken}` : spoken));
          const parsed = parseAmount(spoken);
          if (parsed && !amount) setAmount(parsed);
        }
      }
      setListening(false);
    };

    recognitionRef.current = recognition;
    setVoiceError(null);
    setListening(true);
    recognition.start();
  }

  function stopVoice() {
    recognitionRef.current?.stop?.();
    setListening(false);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);

    // ensure form data includes our state (in case user used quick chips)
    form.set("amount", (form.get("amount") as string) || amount);
    form.set("category", (form.get("category") as string) || category || "অন্যান্য");
    form.set("note", (form.get("note") as string) || note);
    form.set("expenseDate", (form.get("expenseDate") as string) || expenseDate);

    const expenseAmount = parseFloat((form.get("amount") as string) || "0");
    const templateCategory = (form.get("category") as string) || "অন্যান্য";
    const templateAmount = (form.get("amount") as string) || "0";
    
    if (!initialValues) {
      const template: ExpenseTemplate = {
        category: templateCategory,
        amount: templateAmount,
        note: (form.get("note") as string) || "",
        count: 1,
        lastUsed: Date.now(),
      };
      persistTemplates(mergeTemplates(templates, template));
    }

    const isEdit = Boolean(id);
    const expenseId = id || crypto.randomUUID();
    const previousAmountRaw = initialValues?.amount;
    const previousAmount = previousAmountRaw ? Number(previousAmountRaw) : NaN;
    const shouldOptimisticallyUpdate = !online || !realtime.connected;
    let updateId: string | undefined;
    let pendingEvent: {
      payload: {
        type: "expense";
        operation: "add" | "subtract";
        amount: number;
        shopId: string;
        metadata?: {
          expenseId?: string;
          previousAmount?: number;
          timestamp?: number;
          skipCount?: boolean;
        };
      };
      correlationId?: string;
    } | null = null;

    if (shouldOptimisticallyUpdate && Number.isFinite(expenseAmount)) {
      let op: "add" | "subtract" | null = null;
      let deltaAmount = 0;
      let skipCount = false;

      if (isEdit && Number.isFinite(previousAmount)) {
        const delta = Number((expenseAmount - previousAmount).toFixed(2));
        if (delta !== 0) {
          op = delta > 0 ? "add" : "subtract";
          deltaAmount = Math.abs(delta);
          skipCount = true;
        }
      } else {
        op = "add";
        deltaAmount = expenseAmount;
      }

      if (op && deltaAmount > 0) {
        updateId = realTimeReports.updateExpenseReport(deltaAmount, op, {
          expenseId,
          previousAmount: Number.isFinite(previousAmount) ? previousAmount : undefined,
          timestamp: Date.now(),
          skipCount,
        });

        const eventPayload = {
          type: "expense" as const,
          operation: op,
          amount: deltaAmount,
          shopId,
          metadata: {
            expenseId,
            previousAmount: Number.isFinite(previousAmount) ? previousAmount : undefined,
            timestamp: Date.now(),
            skipCount,
          },
        };

        if (online) {
          pendingEvent = { payload: eventPayload, correlationId: updateId };
        } else {
          emitExpenseUpdate(shopId, eventPayload, {
            source: "ui",
            priority: "high",
            correlationId: updateId,
          });
        }
      }
    }

    if (online) {
      try {
        await action(form);
        if (pendingEvent) {
          emitExpenseUpdate(shopId, pendingEvent.payload, {
            source: "ui",
            priority: "high",
            correlationId: pendingEvent.correlationId,
          });
        }
        toast.success(isEdit ? "খরচ আপডেট হয়েছে" : "খরচ যোগ হয়েছে");
        router.push(backHref);
        // Background sync for consistency
        setTimeout(() => {
          if (updateId) {
            realTimeReports.syncWithServer(updateId);
          } else {
            realTimeReports.syncWithServer();
          }
        }, 500);
      } catch (error) {
        if (isRedirectError(error)) {
          return;
        }
        // Rollback on error
        if (updateId) {
          realTimeReports.rollbackLastUpdate();
        }
        console.error('Expense creation failed:', error);
        toast.error("খরচ সংরক্ষণ করা যায়নি");
      }
      return;
    }

    const payload = {
      id: expenseId,
      shopId,
      amount: form.get("amount") as string,
      category: (form.get("category") as string) || "অন্যান্য",
      note: (form.get("note") as string) || "",
      expenseDate: (form.get("expenseDate") as string) || new Date().toISOString().slice(0, 10),
      createdAt: Date.now(),
      syncStatus: isEdit ? "updated" as const : "new" as const,
    };

    await db.expenses.put(payload as any);
    await queueAdd("expense", isEdit ? "update" : "create", payload);
    toast.warning(
      isEdit
        ? "অফলাইন: খরচ আপডেট কিউ হয়েছে, সংযোগ পেলে সিঙ্ক হবে।"
        : "অফলাইন: খরচ সংরক্ষিত, সংযোগ পেলে সিঙ্ক হবে।"
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_16px_36px_rgba(15,23,42,0.08)] animate-fade-in">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-warning-soft/60 via-card to-card" />
        <div className="pointer-events-none absolute -top-16 right-0 h-40 w-40 rounded-full bg-warning/20 blur-3xl" />
        <div className="relative space-y-3 p-4">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              খরচ
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
              স্মার্ট টেমপ্লেট
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
        {/* Amount */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-base font-medium text-foreground">
              খরচের পরিমাণ (৳) *
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
              onClick={listening ? stopVoice : () => startVoice("amount")}
              disabled={!voiceReady}
              aria-label={listening ? "ভয়েস বন্ধ করুন" : "ভয়েস ইনপুট চালু করুন"}
              className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${
                listening
                  ? "bg-primary-soft text-primary border-primary/40 animate-pulse"
                  : "bg-primary-soft text-primary border-primary/30 active:scale-95"
              } ${!voiceReady ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              {listening ? "🔴" : "🎤"}
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

        {/* Category */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-2">
          <label className="block text-base font-medium text-foreground">
            খরচের ক্যাটাগরি *
          </label>
          <div className="flex flex-wrap gap-2">
            {categoryOptions.slice(0, 8).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`h-9 px-3 rounded-full border text-xs font-semibold ${
                  category === c
                    ? "bg-primary-soft border-primary/40 text-primary"
                    : "bg-card border-border text-foreground hover:border-primary/30"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <input
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full h-11 border border-border rounded-xl px-4 text-base bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="যেমন: বিদ্যুৎ"
            required
          />
          <p className="text-xs text-muted-foreground">
            বেশি ব্যবহৃত ক্যাটাগরি উপরে দেখাচ্ছে
          </p>
        </div>

        {/* Date + Note */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-base font-medium text-foreground">
                তারিখ *
              </label>
              <input
                name="expenseDate"
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full h-11 border border-border rounded-xl px-4 text-base bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-base font-medium text-foreground">
                  নোট (ঐচ্ছিক)
                </label>
                <button
                  type="button"
                  onClick={listening ? stopVoice : () => startVoice("note")}
                  disabled={!voiceReady}
                  aria-label={listening ? "ভয়েস বন্ধ করুন" : "ভয়েস নোট চালু করুন"}
                  className={`inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${
                    listening
                      ? "bg-primary-soft text-primary border-primary/40 animate-pulse"
                      : "bg-primary-soft text-primary border-primary/30 active:scale-95"
                  } ${!voiceReady ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  {listening ? "🔴" : "🎤"}
                </button>
              </div>
              <textarea
                name="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="যেমন: বিল পরিশোধ, রিকশা ভাড়া..."
                className="w-full min-h-[120px] border border-border rounded-xl px-4 py-3 text-base bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                {noteVoiceHint}{" "}
                {voiceErrorText ? (
                  <span className="text-danger">{voiceErrorText}</span>
                ) : null}
              </p>
            </div>
          </div>
        </div>

        {/* Recent templates */}
        {recentTemplates.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">
                রিসেন্ট খরচ
              </h3>
              <span className="text-xs text-muted-foreground">
                এক ট্যাপে অটো-ফিল
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {recentTemplates.slice(0, 4).map((t) => (
                <button
                  key={`${t.category}-${t.amount}-${t.lastUsed}`}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="flex items-center justify-between gap-3 bg-card border border-border rounded-xl px-3 py-2 text-left shadow-sm hover:border-primary/40 transition-colors"
                >
                  <div>
                    <p className="font-semibold text-foreground">{t.category}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.note ? t.note : "নোট নেই"}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-primary">
                    ৳ {t.amount}
                  </span>
                </button>
              ))}
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



