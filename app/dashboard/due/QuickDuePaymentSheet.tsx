"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useOnlineStatus } from "@/lib/sync/net-status";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

type DueCustomer = {
  id: string;
  name: string;
  totalDue: string | number;
};

type QuickDuePaymentSheetProps = {
  shopId: string;
  customers: DueCustomer[];
  defaultCustomerId?: string;
  triggerLabel?: string;
  triggerClassName?: string;
  onSuccess?: (customerId: string) => void;
  onOpenFullForm?: (customerId?: string) => void;
};

function parseAmount(text: string) {
  const match = text.match(/(\d+(?:[.,]\d+)?)/);
  return match ? match[1].replace(",", "") : "";
}

export default function QuickDuePaymentSheet({
  shopId,
  customers,
  defaultCustomerId,
  triggerLabel = "দ্রুত পেমেন্ট",
  triggerClassName = "",
  onSuccess,
  onOpenFullForm,
}: QuickDuePaymentSheetProps) {
  const online = useOnlineStatus();
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [open, setOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? "");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [listeningField, setListeningField] = useState<
    "paymentAmount" | "paymentDescription" | null
  >(null);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const selectedCustomer = useMemo(
    () => customers.find((item) => item.id === customerId) || null,
    [customers, customerId]
  );

  const canSubmit = useMemo(() => {
    const amountNum = Number(amount);
    return (
      online &&
      Boolean(customerId) &&
      Number.isFinite(amountNum) &&
      amountNum > 0
    );
  }, [amount, customerId, online]);

  const amountSuggestions = useMemo(() => {
    if (!selectedCustomer) return ["100", "500", "1000"];
    const due = Number(selectedCustomer.totalDue || 0);
    const next = ["100", "500", "1000"];
    if (Number.isFinite(due) && due > 0) {
      next.unshift(due.toFixed(2));
    }
    return Array.from(new Set(next)).slice(0, 4);
  }, [selectedCustomer]);

  const voiceErrorText = voiceError ? `(${voiceError})` : "";
  const isVoiceListening = listeningField !== null;
  const isListeningPaymentAmount = listeningField === "paymentAmount";
  const isListeningPaymentDescription = listeningField === "paymentDescription";
  const paymentAmountVoiceHint = isListeningPaymentAmount
    ? "শুনছি... পরিমাণ বলুন"
    : voiceReady
      ? "ভয়েসে বললে অটো পূরণ হবে"
      : "এই ডিভাইসে ভয়েস সাপোর্ট নেই";
  const paymentDescriptionVoiceHint = isListeningPaymentDescription
    ? "শুনছি... বিবরণ বলুন"
    : voiceReady
      ? "ভয়েসে বিবরণ বলুন"
      : "এই ডিভাইসে ভয়েস সাপোর্ট নেই";

  useEffect(() => {
    const SpeechRecognitionImpl =
      typeof window !== "undefined"
        ? ((window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition)
        : null;
    setVoiceReady(Boolean(SpeechRecognitionImpl));
    return () => {
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
    recognitionRef.current?.stop?.();
    recognitionRef.current?.abort?.();
    setListeningField(null);
  }

  function startVoice(field: "paymentAmount" | "paymentDescription") {
    if (listeningField === field) return;
    if (listeningField) stopVoice();
    const SpeechRecognitionImpl =
      typeof window !== "undefined"
        ? ((window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition)
        : null;

    if (!SpeechRecognitionImpl) {
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
        if (field === "paymentAmount") {
          const parsed = parseAmount(spoken);
          if (parsed) setAmount(parsed);
          const leftover = parsed ? spoken.replace(parsed, "").trim() : spoken;
          if (leftover && !description) setDescription(leftover);
        } else {
          setDescription((prev) => (prev ? `${prev} ${spoken}` : spoken));
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

  const resetForm = () => {
    setAmount("");
    setDescription("");
    if (!defaultCustomerId) setCustomerId("");
  };

  const handleOpen = () => {
    if (!customerId && defaultCustomerId) {
      setCustomerId(defaultCustomerId);
    }
    setOpen(true);
  };

  const handleTriggerClick = () => {
    const isMobileNow =
      typeof window !== "undefined"
        ? window.matchMedia("(max-width: 767px)").matches
        : isMobileViewport;
    if (!isMobileNow && onOpenFullForm) {
      onOpenFullForm(customerId || defaultCustomerId);
      return;
    }
    handleOpen();
  };

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/due/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId,
          customerId,
          amount: Number(amount),
          description: description.trim() || undefined,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "পেমেন্ট সংরক্ষণ করা যায়নি");
      }

      toast.success("পেমেন্ট রেকর্ড হয়েছে");
      setOpen(false);
      resetForm();
      onSuccess?.(customerId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "পেমেন্ট সংরক্ষণ করা যায়নি";
      toast.error(message);
    } finally {
      setSaving(false);
    }
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
              দ্রুত পেমেন্ট নিন
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              ধাপে ধাপে গ্রাহক বাছাই করুন, পরিমাণ দিন, তারপর সেভ করুন।
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <label className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">
                ধাপ ১: গ্রাহক
              </span>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                disabled={Boolean(defaultCustomerId)}
                className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none ring-0 transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20 disabled:bg-muted/50"
              >
                <option value="">গ্রাহক বাছাই করুন</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} — বাকি {Number(customer.totalDue || 0).toFixed(2)} ৳
                  </option>
                ))}
              </select>
            </label>

            {selectedCustomer ? (
              <p className="rounded-xl border border-warning/30 bg-warning-soft/50 px-3 py-2 text-xs font-medium text-warning">
                বর্তমান বাকি: {Number(selectedCustomer.totalDue || 0).toFixed(2)} ৳
              </p>
            ) : null}

            <label className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">
                ধাপ ২: পেমেন্ট (৳)
              </span>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="যেমন 500"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-12 w-full rounded-xl border border-border bg-card px-4 pr-16 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={
                    isListeningPaymentAmount
                      ? stopVoice
                      : () => startVoice("paymentAmount")
                  }
                  disabled={
                    !voiceReady ||
                    (isVoiceListening && !isListeningPaymentAmount)
                  }
                  aria-label={
                    isListeningPaymentAmount
                      ? "ভয়েস বন্ধ করুন"
                      : "ভয়েস ইনপুট চালু করুন"
                  }
                  className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${
                    isListeningPaymentAmount
                      ? "bg-primary-soft text-primary border-primary/40 animate-pulse"
                      : "bg-primary-soft text-primary border-primary/30 active:scale-95"
                  } ${
                    !voiceReady ||
                    (isVoiceListening && !isListeningPaymentAmount)
                      ? "opacity-60 cursor-not-allowed"
                      : ""
                  }`}
                >
                  {isListeningPaymentAmount ? "🔴" : "🎤"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {paymentAmountVoiceHint}{" "}
                {voiceErrorText ? (
                  <span className="text-danger">{voiceErrorText}</span>
                ) : null}
              </p>
            </label>
            <div className="flex flex-wrap gap-2">
              {amountSuggestions.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAmount(value)}
                  className="h-8 rounded-full border border-primary/30 bg-primary-soft px-3 text-xs font-semibold text-primary transition-colors hover:border-primary/40"
                >
                  ৳ {value}
                </button>
              ))}
            </div>

            <label className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">
                ধাপ ৩: বিবরণ (ঐচ্ছিক)
              </span>
              <div className="relative">
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="যেমন নগদ পেমেন্ট"
                  className="h-12 w-full rounded-xl border border-border bg-card px-4 pr-16 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={
                    isListeningPaymentDescription
                      ? stopVoice
                      : () => startVoice("paymentDescription")
                  }
                  disabled={
                    !voiceReady ||
                    (isVoiceListening && !isListeningPaymentDescription)
                  }
                  aria-label={
                    isListeningPaymentDescription
                      ? "ভয়েস বন্ধ করুন"
                      : "ভয়েস ইনপুট চালু করুন"
                  }
                  className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${
                    isListeningPaymentDescription
                      ? "bg-primary-soft text-primary border-primary/40 animate-pulse"
                      : "bg-primary-soft text-primary border-primary/30 active:scale-95"
                  } ${
                    !voiceReady ||
                    (isVoiceListening && !isListeningPaymentDescription)
                      ? "opacity-60 cursor-not-allowed"
                      : ""
                  }`}
                >
                  {isListeningPaymentDescription ? "🔴" : "🎤"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {paymentDescriptionVoiceHint}{" "}
                {voiceErrorText ? (
                  <span className="text-danger">{voiceErrorText}</span>
                ) : null}
              </p>
            </label>
            {!online ? (
              <p className="rounded-xl border border-warning/30 bg-warning-soft/50 px-3 py-2 text-xs font-medium text-warning">
                এখন অফলাইনে আছেন। পেমেন্ট সেভ করতে অনলাইনে আসুন।
              </p>
            ) : null}

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || saving}
                className="h-11 w-full rounded-xl border border-success/30 bg-success-soft px-4 text-sm font-semibold text-success transition hover:border-success/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "সংরক্ষণ হচ্ছে..." : "পেমেন্ট সেভ করুন"}
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
                    stopVoice();
                    setOpen(false);
                    onOpenFullForm?.(customerId || defaultCustomerId);
                  }}
                  disabled={saving || !onOpenFullForm}
                  className="h-10 rounded-full border border-primary/30 bg-primary-soft px-4 text-xs font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
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
