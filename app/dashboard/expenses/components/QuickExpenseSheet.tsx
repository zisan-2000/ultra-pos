"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getDhakaDateString } from "@/lib/reporting-range";
import {
  getSpeechRecognitionCtor,
  mapVoiceErrorBangla,
  startDualLanguageVoice,
  type VoiceSession,
} from "@/lib/voice-recognition";

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

function parseAmount(text: string) {
  const match = text.match(/(\d+(?:[.,]\d+)?)/);
  return match ? match[1].replace(",", "") : "";
}

const QUICK_CATEGORIES = [
  "পরিবহন",
  "চা-নাশতা",
  "প্যাকেট/ব্যাগ/স্টেশনারি",
  "বিদ্যুৎ/ইন্টারনেট",
  "দৈনিক শ্রম/হেল্পার",
  "অন্যান্য",
];

type QuickExpenseSheetProps = {
  shopId: string;
  triggerClassName?: string;
  triggerLabel?: string;
  onCreated?: () => void;
  fullFormHref?: string;
};

export default function QuickExpenseSheet({
  shopId,
  triggerClassName = "",
  triggerLabel = "নতুন খরচ",
  onCreated,
  fullFormHref,
}: QuickExpenseSheetProps) {
  const router = useRouter();
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const voiceSessionRef = useRef<VoiceSession | null>(null);
  const [open, setOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(QUICK_CATEGORIES[0]);
  const [note, setNote] = useState("");
  const [expenseDate, setExpenseDate] = useState(getDhakaDateString());
  const [saving, setSaving] = useState(false);
  const [listeningField, setListeningField] = useState<"amount" | "note" | null>(
    null
  );
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    const amountNum = Number(amount);
    return Number.isFinite(amountNum) && amountNum > 0 && category.trim().length > 0;
  }, [amount, category]);
  const voiceErrorText = voiceError ? `(${voiceError})` : "";
  const isAmountListening = listeningField === "amount";
  const isNoteListening = listeningField === "note";
  const isVoiceListening = listeningField !== null;
  const amountVoiceHint = isAmountListening
    ? "শুনছি... খরচের নাম/দাম বলুন"
    : voiceReady
      ? "ভয়েসে বললে অটো পূরণ হবে"
      : "এই ডিভাইসে ভয়েস সাপোর্ট নেই";
  const noteVoiceHint = isNoteListening
    ? "শুনছি... নোট বলুন"
    : voiceReady
      ? "ভয়েসে নোট বলুন"
      : "এই ডিভাইসে ভয়েস সাপোর্ট নেই";

  useEffect(() => {
    const SpeechRecognitionImpl = getSpeechRecognitionCtor();
    setVoiceReady(Boolean(SpeechRecognitionImpl));
    return () => {
      voiceSessionRef.current?.stop();
      voiceSessionRef.current = null;
      recognitionRef.current?.stop?.();
      recognitionRef.current?.abort?.();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsMobileViewport(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  function stopVoice() {
    voiceSessionRef.current?.stop();
    voiceSessionRef.current = null;
    recognitionRef.current?.stop?.();
    recognitionRef.current?.abort?.();
    setListeningField(null);
  }

  function startVoice(field: "amount" | "note") {
    if (isVoiceListening) return;
    voiceSessionRef.current?.stop();
    voiceSessionRef.current = startDualLanguageVoice({
      onRecognitionRef: (recognition) => {
        recognitionRef.current = recognition;
      },
      onTranscript: (spoken) => {
        if (field === "amount") {
          const parsed = parseAmount(spoken);
          if (parsed) setAmount(parsed);
          const leftover = parsed ? spoken.replace(parsed, "").trim() : spoken;
          if (leftover && !note) setNote(leftover);
          return;
        }
        setNote((prev) => (prev ? `${prev} ${spoken}` : spoken));
        const parsed = parseAmount(spoken);
        if (parsed && !amount) setAmount(parsed);
      },
      onError: (kind) => {
        if (kind === "aborted") return;
        setVoiceError(mapVoiceErrorBangla(kind));
      },
      onEnd: () => {
        setListeningField(null);
        voiceSessionRef.current = null;
      },
    });
    if (!voiceSessionRef.current) return;
    setVoiceError(null);
    setListeningField(field);
  }

  const resetForm = () => {
    setAmount("");
    setCategory(QUICK_CATEGORIES[0]);
    setNote("");
    setExpenseDate(getDhakaDateString());
  };

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/expenses/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId,
          amount,
          category: category.trim() || "অন্যান্য",
          note: note.trim(),
          expenseDate,
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || "খরচ যোগ করা যায়নি");
      }

      toast.success("খরচ যোগ হয়েছে");
      setOpen(false);
      resetForm();
      onCreated?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "খরচ যোগ করা যায়নি";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleTriggerClick = () => {
    const isMobileNow =
      typeof window !== "undefined"
        ? window.matchMedia("(max-width: 767px)").matches
        : isMobileViewport;
    if (!isMobileNow && fullFormHref) {
      router.push(fullFormHref);
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleTriggerClick}
        className={triggerClassName}
      >
        {triggerLabel}
      </button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) stopVoice();
          setOpen(nextOpen);
        }}
      >
        <DialogContent
          className={
            isMobileViewport
              ? "bottom-0 left-0 right-0 top-auto z-[70] max-h-[86vh] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-t-3xl border-border/70 bg-background p-4 shadow-[0_24px_70px_rgba(15,23,42,0.22)] data-[state=closed]:slide-out-to-bottom-[4%] data-[state=open]:slide-in-from-bottom-[8%]"
              : "left-[50%] top-[50%] z-[70] max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border-border/70 bg-background p-4 shadow-[0_24px_70px_rgba(15,23,42,0.22)]"
          }
          overlayClassName={isMobileViewport ? "bg-black/55" : "bg-black/45"}
        >
          <DialogHeader className="space-y-1 pr-8">
            <DialogTitle className="text-xl font-bold text-foreground">
              দ্রুত খরচ যোগ করুন
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              কম তথ্য দিয়ে দ্রুত খরচ লিখে সেভ করুন।
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">টাকা</span>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="যেমন 120"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="h-12 w-full rounded-xl border border-border bg-card px-4 pr-16 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    type="button"
                    onClick={isAmountListening ? stopVoice : () => startVoice("amount")}
                    disabled={!voiceReady || (isVoiceListening && !isAmountListening)}
                    aria-label={isAmountListening ? "ভয়েস বন্ধ করুন" : "ভয়েস ইনপুট চালু করুন"}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${
                      isAmountListening
                        ? "bg-primary-soft text-primary border-primary/40 animate-pulse"
                        : "bg-primary-soft text-primary border-primary/30 active:scale-95"
                    } ${!voiceReady || (isVoiceListening && !isAmountListening) ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    {isAmountListening ? "🔴" : "🎤"}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {amountVoiceHint}{" "}
                  {voiceErrorText ? (
                    <span className="text-danger">{voiceErrorText}</span>
                  ) : null}
                </p>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">তারিখ</span>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none ring-0 transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                />
              </label>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">খরচের ধরন</span>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="নিজের মতো লিখুন (যেমন: বাজার খরচ)"
                list="quick-expense-category-options"
                className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none ring-0 transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
              />
              <datalist id="quick-expense-category-options">
                {QUICK_CATEGORIES.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
              <div className="flex flex-wrap gap-2">
                {QUICK_CATEGORIES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    className={`h-9 rounded-full border px-3 text-xs font-semibold transition ${
                      category === item
                        ? "border-primary/35 bg-primary-soft text-primary"
                        : "border-border bg-card text-foreground hover:border-primary/25 hover:bg-primary-soft/40"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <label className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  নোট (ঐচ্ছিক)
                </span>
                <button
                  type="button"
                  onClick={isNoteListening ? stopVoice : () => startVoice("note")}
                  disabled={!voiceReady || (isVoiceListening && !isNoteListening)}
                  aria-label={isNoteListening ? "ভয়েস বন্ধ করুন" : "ভয়েস নোট চালু করুন"}
                  className={`inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${
                    isNoteListening
                      ? "bg-primary-soft text-primary border-primary/40 animate-pulse"
                      : "bg-primary-soft text-primary border-primary/30 active:scale-95"
                  } ${!voiceReady || (isVoiceListening && !isNoteListening) ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  {isNoteListening ? "🔴" : "🎤"}
                </button>
              </div>
              <div>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="খরচের ছোট নোট লিখুন"
                  className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {noteVoiceHint}{" "}
                {voiceErrorText ? (
                  <span className="text-danger">{voiceErrorText}</span>
                ) : null}
              </p>
            </label>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || saving}
                className="h-11 w-full rounded-xl border border-primary/30 bg-primary-soft px-4 text-sm font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "সেভ হচ্ছে..." : "খরচ সেভ করুন"}
              </button>
              <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  stopVoice();
                  setOpen(false);
                }}
                disabled={saving}
                className="h-10 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-60"
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!fullFormHref) return;
                  stopVoice();
                  setOpen(false);
                  router.push(fullFormHref);
                }}
                disabled={saving || !fullFormHref}
                className="h-10 rounded-full border border-primary/30 bg-primary-soft px-4 text-xs font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                পূর্ণ ফর্ম
              </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
