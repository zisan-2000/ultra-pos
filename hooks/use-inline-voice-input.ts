"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

type VoiceMode = "text" | "amount" | "phone";

type StartVoiceInput = {
  field: string;
  mode: VoiceMode;
  onValue: (value: string) => void;
};

const BANGLA_DIGIT_MAP: Record<string, string> = {
  "০": "0",
  "১": "1",
  "২": "2",
  "৩": "3",
  "৪": "4",
  "৫": "5",
  "৬": "6",
  "৭": "7",
  "৮": "8",
  "৯": "9",
};

function normalizeDigits(value: string) {
  return value.replace(/[০-৯]/g, (char) => BANGLA_DIGIT_MAP[char] ?? char);
}

function parseAmount(value: string) {
  const normalized = normalizeDigits(value).replace(/,/g, "");
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  return match?.[1] ?? "";
}

function parsePhone(value: string) {
  const normalized = normalizeDigits(value);
  const digits = normalized.replace(/\D/g, "");
  return digits.slice(0, 15);
}

function transformTranscript(mode: VoiceMode, transcript: string) {
  const clean = transcript.trim();
  if (!clean) return "";
  if (mode === "amount") return parseAmount(clean);
  if (mode === "phone") return parsePhone(clean);
  return clean;
}

export function useInlineVoiceInput() {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [voiceReady] = useState(() => {
    if (typeof window === "undefined") return false;
    return Boolean(
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    );
  });
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [listeningField, setListeningField] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop?.();
      recognitionRef.current?.abort?.();
    };
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop?.();
    recognitionRef.current?.abort?.();
    setListeningField(null);
  }, []);

  const startListening = useCallback(
    ({ field, mode, onValue }: StartVoiceInput) => {
      const SpeechRecognitionImpl =
        typeof window !== "undefined"
          ? ((window as any).SpeechRecognition ||
              (window as any).webkitSpeechRecognition)
          : null;

      if (!SpeechRecognitionImpl) {
        setVoiceError("ব্রাউজার মাইক্রোফোন সমর্থন দিচ্ছে না");
        return;
      }

      if (listeningField === field) {
        stopListening();
        return;
      }

      recognitionRef.current?.stop?.();
      recognitionRef.current?.abort?.();
      setVoiceError(null);

      const recognition: SpeechRecognitionInstance = new SpeechRecognitionImpl();
      recognitionRef.current = recognition;
      recognition.lang = "bn-BD";
      recognition.interimResults = false;
      recognition.continuous = false;

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results || [])
          .map((result: any) => result?.[0]?.transcript || "")
          .join(" ")
          .trim();
        const transformed = transformTranscript(mode, transcript);
        if (!transformed && mode !== "text") {
          setVoiceError("সংখ্যা ঠিকমতো বোঝা যায়নি");
          return;
        }
        onValue(transformed || transcript);
      };

      recognition.onerror = (event: any) => {
        if (event?.error === "not-allowed") {
          setVoiceError("মাইক্রোফোন permission দিন");
        } else if (event?.error === "no-speech") {
          setVoiceError("কিছু শোনা যায়নি, আবার বলুন");
        } else {
          setVoiceError("ভয়েস ইনপুট নেওয়া যায়নি");
        }
      };

      recognition.onend = () => {
        setListeningField((current) => (current === field ? null : current));
      };

      setListeningField(field);
      try {
        recognition.start();
      } catch {
        setListeningField(null);
        setVoiceError("ভয়েস ইনপুট চালু করা যায়নি");
      }
    },
    [listeningField, stopListening]
  );

  return {
    voiceReady,
    voiceError,
    listeningField,
    startListening,
    stopListening,
  };
}
