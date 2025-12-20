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
  initialValues,
  submitLabel = "+ দ্রুত ক্যাশ এন্ট্রি করুন",
}: Props) {
  const online = useOnlineStatus();
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [listening, setListening] = useState(false);
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
          const leftover = parsed ? spoken.replace(parsed, "").trim() : spoken;
          if (leftover && !reason) setReason(leftover);
        } else {
          setReason((prev) => (prev ? `${prev} ${spoken}` : spoken));
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
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-8 space-y-6">
      {/* Entry Type */}
      <div className="space-y-2">
        <label className="block text-base font-medium text-gray-900">ক্যাশ টাইপ *</label>
        <div className="flex flex-wrap gap-2">
          {["IN", "OUT"].map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setEntryType(type as "IN" | "OUT")}
              className={`px-3 py-2 rounded-full border text-sm ${
                entryType === type
                  ? "bg-emerald-50 border-emerald-400 text-emerald-800"
                  : "bg-white border-gray-200 text-gray-700 hover:border-emerald-200"
              }`}
            >
              {type === "IN" ? "ক্যাশ ইন" : "ক্যাশ আউট"}
            </button>
          ))}
        </div>
        <input type="hidden" name="entryType" value={entryType} />
        <p className="text-sm text-gray-500">সর্বশেষ ব্যবহৃত টাইপ নির্বাচিত থাকে</p>
      </div>

      {/* Amount */}
      <div className="space-y-2">
        <label className="block text-base font-medium text-gray-900">পরিমাণ (৳) *</label>
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
        <p className="text-sm text-gray-500">“ক্যাশ ইন ৫০০” বললেই পরিমাণ ফিল হবে</p>
      </div>

      {/* Reason */}
      <div className="space-y-2">
        <label className="block text-base font-medium text-gray-900">কারণ (ঐচ্ছিক)</label>
        <div className="flex gap-3">
          <input
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="যেমন: বিক্রয় টাকা, মালিককে ক্যাশ"
          />
          <button
            type="button"
            onClick={listening ? stopVoice : () => startVoice("reason")}
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
        <div className="flex flex-wrap gap-2">
          {reasonOptions.slice(0, 6).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className="px-3 py-2 rounded-full border border-gray-200 bg-white text-sm hover:border-emerald-200"
            >
              {r}
            </button>
          ))}
        </div>
        <p className="text-sm text-gray-500">বেশি ব্যবহৃত কারণগুলো এক ট্যাপে পাওয়া যাবে</p>
      </div>

      {/* Recent templates */}
      {recentTemplates.length > 0 && (
        <div className="border border-emerald-100 bg-emerald-50 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-emerald-800">রিসেন্ট ক্যাশ</h3>
            <span className="text-xs text-emerald-700">এক ট্যাপে অটো-ফিল</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {recentTemplates.slice(0, 4).map((t) => (
              <button
                key={`${t.entryType}-${t.amount}-${t.lastUsed}`}
                type="button"
                onClick={() => applyTemplate(t)}
                className="flex items-center justify-between gap-3 bg-white border border-emerald-100 rounded-lg px-3 py-2 text-left hover:border-emerald-300 transition-colors"
              >
                <div>
                  <p className="font-semibold text-gray-900">
                    {t.entryType === "IN" ? "ক্যাশ ইন" : "ক্যাশ আউট"} • ৳ {t.amount}
                  </p>
                  <p className="text-xs text-gray-500">{t.reason || "কারণ নেই"}</p>
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
