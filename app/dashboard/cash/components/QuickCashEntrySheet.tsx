"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { showSuccessToast, showErrorToast } from "@/components/ui/action-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type QuickCashEntrySheetProps = {
  shopId: string;
  triggerLabel?: string;
  triggerClassName?: string;
  fullFormHref?: string;
  onCreated?: () => void;
};

export default function QuickCashEntrySheet({
  shopId,
  triggerLabel = "নতুন এন্ট্রি",
  triggerClassName = "",
  fullFormHref,
  onCreated,
}: QuickCashEntrySheetProps) {
  const router = useRouter();
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const voiceSessionRef = useRef<VoiceSession | null>(null);
  const [open, setOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [entryType, setEntryType] = useState<"IN" | "OUT">("IN");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [listeningField, setListeningField] = useState<"amount" | "reason" | null>(null);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    const amountNum = Number(amount);
    return Number.isFinite(amountNum) && amountNum > 0;
  }, [amount]);
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

  function startVoice(field: "amount" | "reason") {
    if (listeningField === field) return;
    if (listeningField) stopVoice();
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
          if (leftover && !reason) setReason(leftover);
          return;
        }
        setReason((prev) => (prev ? `${prev} ${spoken}` : spoken));
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

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/cash/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId,
          entryType,
          amount,
          reason: reason.trim() || "",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.error || "ক্যাশ এন্ট্রি যোগ করা যায়নি");
      }
      showSuccessToast({
        title: "ক্যাশ এন্ট্রি যোগ হয়েছে",
        amount: Number(amount) > 0 ? Number(amount) : undefined,
        subtitle: reason?.trim() || undefined,
        badge:
          entryType === "IN"
            ? { label: "ইন", color: "text-emerald-700 bg-emerald-50 border-emerald-200" }
            : { label: "আউট", color: "text-rose-700 bg-rose-50 border-rose-200" },
      });
      setOpen(false);
      setAmount("");
      setReason("");
      onCreated?.();
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "ক্যাশ এন্ট্রি যোগ করা যায়নি";
      showErrorToast({
        title: "ক্যাশ এন্ট্রি যোগ করা যায়নি",
        subtitle: message !== "ক্যাশ এন্ট্রি যোগ করা যায়নি" ? message : undefined,
      });
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
      <button type="button" onClick={handleTriggerClick} className={triggerClassName}>
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
              দ্রুত ক্যাশ এন্ট্রি
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              টাইপ, পরিমাণ ও কারণ লিখে দ্রুত সেভ করুন।
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEntryType("IN")}
                className={`h-11 rounded-full border text-sm font-semibold transition ${
                  entryType === "IN"
                    ? "border-success/30 bg-success-soft text-success"
                    : "border-border bg-card text-foreground"
                }`}
              >
                + ক্যাশ ইন
              </button>
              <button
                type="button"
                onClick={() => setEntryType("OUT")}
                className={`h-11 rounded-full border text-sm font-semibold transition ${
                  entryType === "OUT"
                    ? "border-danger/30 bg-danger-soft text-danger"
                    : "border-border bg-card text-foreground"
                }`}
              >
                - ক্যাশ আউট
              </button>
            </div>

            <label className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">
                পরিমাণ (৳) *
              </span>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-12 w-full rounded-xl border border-border bg-card px-4 pr-16 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="যেমন 500"
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
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">
                কারণ (ঐচ্ছিক)
              </span>
              <div className="relative">
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="h-12 w-full rounded-xl border border-border bg-card px-4 pr-16 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="যেমন: দৈনিক খরচ"
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
            </label>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || saving}
                className="h-11 w-full rounded-xl border border-primary/30 bg-primary-soft px-4 text-sm font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "সংরক্ষণ হচ্ছে..." : "ক্যাশ এন্ট্রি সেভ করুন"}
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
