"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { db } from "@/lib/dexie/db";
import { queueAdd } from "@/lib/sync/queue";
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

function parsePhone(text: string) {
  const digits = text.replace(/\D/g, "");
  return digits ? digits.slice(0, 15) : "";
}

type QuickCustomerSheetProps = {
  shopId: string;
  triggerClassName?: string;
  triggerLabel?: string;
  onCreated?: (mode: "online" | "offline") => void;
  onOpenFullForm?: () => void;
};

export default function QuickCustomerSheet({
  shopId,
  triggerClassName = "",
  triggerLabel = "➕ নতুন গ্রাহক",
  onCreated,
  onOpenFullForm,
}: QuickCustomerSheetProps) {
  const online = useOnlineStatus();
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [open, setOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [listeningField, setListeningField] = useState<
    "customerName" | "customerPhone" | "customerAddress" | null
  >(null);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0;
  const voiceErrorText = voiceError ? `(${voiceError})` : "";
  const isVoiceListening = listeningField !== null;
  const isListeningName = listeningField === "customerName";
  const isListeningPhone = listeningField === "customerPhone";
  const isListeningAddress = listeningField === "customerAddress";
  const nameVoiceHint = isListeningName
    ? "শুনছি... নাম বলুন"
    : voiceReady
      ? "ভয়েসে নাম বলুন"
      : "এই ডিভাইসে ভয়েস সাপোর্ট নেই";
  const phoneVoiceHint = isListeningPhone
    ? "শুনছি... ফোন বলুন"
    : voiceReady
      ? "ভয়েসে ফোন নম্বর বলুন"
      : "এই ডিভাইসে ভয়েস সাপোর্ট নেই";
  const addressVoiceHint = isListeningAddress
    ? "শুনছি... ঠিকানা বলুন"
    : voiceReady
      ? "ভয়েসে ঠিকানা বলুন"
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

  function startVoice(field: "customerName" | "customerPhone" | "customerAddress") {
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
        if (field === "customerName") {
          const phoneFromSpeech = parsePhone(spoken);
          const parsedName = phoneFromSpeech
            ? spoken.replace(phoneFromSpeech, "").trim()
            : spoken;
          setName(parsedName);
          if (phoneFromSpeech && !phone) {
            setPhone(phoneFromSpeech);
          }
        } else if (field === "customerPhone") {
          const parsedPhone = parsePhone(spoken);
          if (parsedPhone) setPhone(parsedPhone);
        } else if (field === "customerAddress") {
          setAddress(spoken);
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
    setName("");
    setPhone("");
    setAddress("");
  };

  const handleTriggerClick = () => {
    const isMobileNow =
      typeof window !== "undefined"
        ? window.matchMedia("(max-width: 767px)").matches
        : isMobileViewport;
    if (!isMobileNow && onOpenFullForm) {
      onOpenFullForm();
      return;
    }
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    try {
      if (!online) {
        const now = Date.now();
        const payload = {
          id: crypto.randomUUID(),
          shopId,
          name: name.trim(),
          phone: phone.trim() || null,
          address: address.trim() || null,
          totalDue: "0",
          lastPaymentAt: null,
          updatedAt: now,
          syncStatus: "new" as const,
        };
        await db.transaction("rw", db.dueCustomers, db.queue, async () => {
          await db.dueCustomers.put(payload);
          await queueAdd("due_customer", "create", payload);
        });
        toast.success("অফলাইন: গ্রাহক কিউ হয়েছে, অনলাইনে সিঙ্ক হবে");
        setOpen(false);
        resetForm();
        onCreated?.("offline");
        return;
      }

      const response = await fetch("/api/due/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId,
          name: name.trim(),
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "গ্রাহক যোগ করা যায়নি");
      }

      toast.success("গ্রাহক যোগ হয়েছে");
      setOpen(false);
      resetForm();
      onCreated?.("online");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "গ্রাহক যোগ করা যায়নি";
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
              নতুন গ্রাহক যোগ করুন
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              ৩ ধাপে তথ্য দিন: নাম, ফোন, ঠিকানা। তারপর সেভ করুন।
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <label className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">
                ধাপ ১: গ্রাহকের নাম *
              </span>
              <div className="relative">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="যেমন: করিম সাহেব"
                  className="h-12 w-full rounded-xl border border-border bg-card px-4 pr-16 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={isListeningName ? stopVoice : () => startVoice("customerName")}
                  disabled={!voiceReady || (isVoiceListening && !isListeningName)}
                  aria-label={isListeningName ? "ভয়েস বন্ধ করুন" : "ভয়েস ইনপুট চালু করুন"}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${
                    isListeningName
                      ? "bg-primary-soft text-primary border-primary/40 animate-pulse"
                      : "bg-primary-soft text-primary border-primary/30 active:scale-95"
                  } ${!voiceReady || (isVoiceListening && !isListeningName) ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  {isListeningName ? "🔴" : "🎤"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {nameVoiceHint}{" "}
                {voiceErrorText ? <span className="text-danger">{voiceErrorText}</span> : null}
              </p>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">
                ধাপ ২: ফোন (ঐচ্ছিক)
              </span>
              <div className="relative">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="যেমন: 017XXXXXXXX"
                  className="h-12 w-full rounded-xl border border-border bg-card px-4 pr-16 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={isListeningPhone ? stopVoice : () => startVoice("customerPhone")}
                  disabled={!voiceReady || (isVoiceListening && !isListeningPhone)}
                  aria-label={isListeningPhone ? "ভয়েস বন্ধ করুন" : "ভয়েস ইনপুট চালু করুন"}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${
                    isListeningPhone
                      ? "bg-primary-soft text-primary border-primary/40 animate-pulse"
                      : "bg-primary-soft text-primary border-primary/30 active:scale-95"
                  } ${!voiceReady || (isVoiceListening && !isListeningPhone) ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  {isListeningPhone ? "🔴" : "🎤"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {phoneVoiceHint}{" "}
                {voiceErrorText ? <span className="text-danger">{voiceErrorText}</span> : null}
              </p>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">
                ধাপ ৩: ঠিকানা (ঐচ্ছিক)
              </span>
              <div className="relative">
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="যেমন: বাজার রোড"
                  className="h-12 w-full rounded-xl border border-border bg-card px-4 pr-16 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={isListeningAddress ? stopVoice : () => startVoice("customerAddress")}
                  disabled={!voiceReady || (isVoiceListening && !isListeningAddress)}
                  aria-label={isListeningAddress ? "ভয়েস বন্ধ করুন" : "ভয়েস ইনপুট চালু করুন"}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${
                    isListeningAddress
                      ? "bg-primary-soft text-primary border-primary/40 animate-pulse"
                      : "bg-primary-soft text-primary border-primary/30 active:scale-95"
                  } ${!voiceReady || (isVoiceListening && !isListeningAddress) ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  {isListeningAddress ? "🔴" : "🎤"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {addressVoiceHint}{" "}
                {voiceErrorText ? <span className="text-danger">{voiceErrorText}</span> : null}
              </p>
            </label>
            {!online ? (
              <p className="rounded-xl border border-warning/30 bg-warning-soft/50 px-3 py-2 text-xs font-medium text-warning">
                অফলাইনে সেভ হলে এটি কিউ-তে থাকবে, অনলাইনে স্বয়ংক্রিয়ভাবে সিঙ্ক হবে।
              </p>
            ) : (
              <p className="rounded-xl border border-success/30 bg-success-soft/50 px-3 py-2 text-xs font-medium text-success">
                এখন অনলাইন। সেভ করলে সাথে সাথেই গ্রাহক যুক্ত হবে।
              </p>
            )}

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || saving}
                className="h-11 w-full rounded-xl border border-primary/30 bg-primary-soft px-4 text-sm font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "সংরক্ষণ হচ্ছে..." : "গ্রাহক সেভ করুন"}
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
                    onOpenFullForm?.();
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
