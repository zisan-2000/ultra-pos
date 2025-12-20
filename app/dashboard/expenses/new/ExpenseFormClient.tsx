// app/dashboard/expenses/new/ExpenseFormClient.tsx
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

export default function ExpenseFormClient({
  shopId,
  backHref,
  action,
  id,
  initialValues,
  submitLabel = "+ দ্রুত খরচ যোগ করুন",
}: Props) {
  const online = useOnlineStatus();
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
    const stored = localStorage.getItem(storageKey);
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

  function persistTemplates(next: ExpenseTemplate[]) {
    setTemplates(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
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

    if (online) {
      await action(form);
      return;
    }

    const isEdit = Boolean(id);
    const expenseId = id || crypto.randomUUID();
    const payload = {
      id: expenseId,
      shopId,
      amount: form.get("amount") as string,
      category: (form.get("category") as string) || "অন্যন্য",
      note: (form.get("note") as string) || "",
      expenseDate: (form.get("expenseDate") as string) || new Date().toISOString().slice(0, 10),
      createdAt: Date.now(),
      syncStatus: isEdit ? "updated" as const : "new" as const,
    };

    await db.expenses.put(payload as any);
    await queueAdd("expense", isEdit ? "update" : "create", payload);
    alert(isEdit ? "Offline: খরচ আপডেট কিউ হয়েছে, সংযোগ পেলে সিঙ্ক হবে।" : "Offline: খরচ সংরক্ষিত, সংযোগ পেলে সিঙ্ক হবে।");
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-8 space-y-6">
      {/* Amount */}
      <div className="space-y-2">
        <label className="block text-base font-medium text-gray-900">খরচের পরিমাণ (৳) *</label>
        <div className="flex gap-3">
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="যেমন: 500, 1000.50"
            required
          />
          <button
            type="button"
            onClick={listening ? stopVoice : () => startVoice("amount")}
            disabled={!voiceReady}
            className={`shrink-0 px-4 py-3 border rounded-lg font-medium transition-colors ${
              listening
                ? "bg-red-50 border-red-300 text-red-700"
                : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:border-emerald-300"
            } ${!voiceReady ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            {listening ? "থামান" : "ভয়েস"}
          </button>
        </div>
        {amountOptions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {amountOptions.slice(0, 6).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAmount(a)}
                className="px-3 py-2 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm hover:border-emerald-300"
              >
                ৳ {a}
              </button>
            ))}
          </div>
        )}
        <p className="text-sm text-gray-500">“বিদ্যুৎ বিল ১২০০” বললে পরিমাণ অটো হবে</p>
      </div>

      {/* Category */}
      <div className="space-y-2">
        <label className="block text-base font-medium text-gray-900">খরচের ক্যাটাগরি *</label>
        <div className="flex flex-wrap gap-2">
          {categoryOptions.slice(0, 8).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`px-3 py-2 rounded-full border text-sm ${
                category === c
                  ? "bg-emerald-50 border-emerald-400 text-emerald-800"
                  : "bg-white border-gray-200 text-gray-700 hover:border-emerald-200"
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
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder="যেমন: বিদ্যুৎ"
          required
        />
        <p className="text-sm text-gray-500">বেশি ব্যবহৃত ক্যাটাগরি উপরে দেখাচ্ছে</p>
      </div>

      {/* Date */}
      <div className="space-y-2">
        <label className="block text-base font-medium text-gray-900">তারিখ *</label>
        <input
          name="expenseDate"
          type="date"
          value={expenseDate}
          onChange={(e) => setExpenseDate(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
          required
        />
      </div>

      {/* Note */}
      <div className="space-y-2">
        <label className="block text-base font-medium text-gray-900">নোট (ঐচ্ছিক)</label>
        <div className="flex gap-3">
          <textarea
            name="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="যেমন: বিল পরিশোধ, রিকশা ভাড়া..."
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            rows={3}
          />
          <button
            type="button"
            onClick={listening ? stopVoice : () => startVoice("note")}
            disabled={!voiceReady}
            className={`shrink-0 px-4 py-3 border rounded-lg font-medium transition-colors ${
              listening
                ? "bg-red-50 border-red-300 text-red-700"
                : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:border-emerald-300"
            } ${!voiceReady ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            {listening ? "থামান" : "ভয়েস"}
          </button>
        </div>
        <p className="text-sm text-gray-500">এক লাইনে বলুন: “বিল পরিশোধ ১২০০”</p>
      </div>

      {/* Recent templates */}
      {recentTemplates.length > 0 && (
        <div className="border border-emerald-100 bg-emerald-50 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-emerald-800">রিসেন্ট খরচ</h3>
            <span className="text-xs text-emerald-700">এক ট্যাপে অটো-ফিল</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {recentTemplates.slice(0, 4).map((t) => (
              <button
                key={`${t.category}-${t.amount}-${t.lastUsed}`}
                type="button"
                onClick={() => applyTemplate(t)}
                className="flex items-center justify-between gap-3 bg-white border border-emerald-100 rounded-lg px-3 py-2 text-left hover:border-emerald-300 transition-colors"
              >
                <div>
                  <p className="font-semibold text-gray-900">{t.category}</p>
                  <p className="text-xs text-gray-500">৳ {t.amount} {t.note ? `• ${t.note}` : ""}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-3 pt-4">
        <button 
          type="submit"
          className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg text-lg transition-colors"
        >
          {submitLabel}
        </button>
        <Link 
          href={backHref}
          className="flex-1 border border-gray-300 text-gray-900 font-medium py-4 px-6 rounded-lg text-lg hover:bg-gray-100 transition-colors text-center"
        >
          পিছনে যান
        </Link>
      </div>
      {voiceError ? <p className="text-xs text-red-600">{voiceError}</p> : null}
    </form>
  );
}
