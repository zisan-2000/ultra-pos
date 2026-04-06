"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const voiceSessionRef = useRef<VoiceSession | null>(null);
  const [voiceReady] = useState(() => {
    return Boolean(getSpeechRecognitionCtor());
  });
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [listeningField, setListeningField] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      voiceSessionRef.current?.stop();
      voiceSessionRef.current = null;
      recognitionRef.current?.stop?.();
      recognitionRef.current?.abort?.();
    };
  }, []);

  const stopListening = useCallback(() => {
    voiceSessionRef.current?.stop();
    voiceSessionRef.current = null;
    recognitionRef.current?.stop?.();
    recognitionRef.current?.abort?.();
    setListeningField(null);
  }, []);

  const startListening = useCallback(
    ({ field, mode, onValue }: StartVoiceInput) => {
      if (listeningField === field) {
        stopListening();
        return;
      }

      voiceSessionRef.current?.stop();
      voiceSessionRef.current = null;
      recognitionRef.current?.stop?.();
      recognitionRef.current?.abort?.();
      setVoiceError(null);

      voiceSessionRef.current = startDualLanguageVoice({
        onRecognitionRef: (recognition) => {
          recognitionRef.current = recognition;
        },
        onTranscript: (transcript) => {
          const transformed = transformTranscript(mode, transcript);
          if (!transformed && mode !== "text") {
            setVoiceError("সংখ্যা ঠিকমতো বোঝা যায়নি");
            return;
          }
          onValue(transformed || transcript);
        },
        onError: (kind) => {
          if (kind === "aborted") return;
          if (kind === "permission_denied") {
            setVoiceError("মাইক্রোফোন permission দিন");
            return;
          }
          if (kind === "no_speech") {
            setVoiceError("কিছু শোনা যায়নি, আবার বলুন");
            return;
          }
          setVoiceError(mapVoiceErrorBangla(kind));
        },
        onEnd: () => {
          setListeningField((current) => (current === field ? null : current));
          voiceSessionRef.current = null;
        },
      });
      if (!voiceSessionRef.current) {
        setVoiceError("ব্রাউজার মাইক্রোফোন সমর্থন দিচ্ছে না");
        return;
      }
      setListeningField(field);
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
