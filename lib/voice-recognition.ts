"use client";

export type SpeechRecognitionInstance = {
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

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

export type VoiceErrorKind =
  | "not_supported"
  | "permission_denied"
  | "no_speech"
  | "aborted"
  | "unavailable";

type VoiceAttempt = "primary" | "fallback";

type RecognitionResult = {
  transcript: string | null;
  errorCode: string | null;
};

type StartDualLanguageVoiceOptions = {
  primaryLang?: string;
  fallbackLang?: string;
  maxAttemptsPerLanguage?: number;
  interimSilenceMs?: number;
  recognitionCtor?: SpeechRecognitionConstructor | null;
  onRecognitionRef?: (recognition: SpeechRecognitionInstance | null) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onInterimTranscript?: (
    transcript: string,
    context: { lang: string; attempt: VoiceAttempt }
  ) => void;
  onTranscript: (
    transcript: string,
    context: { lang: string; attempt: VoiceAttempt }
  ) => void;
  onError?: (kind: VoiceErrorKind, errorCode?: string | null) => void;
};

export type VoiceSession = {
  stop: () => void;
};

const PRIMARY_LANG = "bn-BD";
const FALLBACK_LANG = "en-US";
const DEFAULT_INTERIM_SILENCE_MS = 2400;

const PERMISSION_ERROR_CODES = new Set([
  "not-allowed",
  "denied",
  "service-not-allowed",
]);
const ABORT_ERROR_CODES = new Set(["aborted"]);

function normalizeTranscript(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return (
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null
  );
}

export function mapVoiceErrorBangla(kind: VoiceErrorKind) {
  if (kind === "not_supported") return "ব্রাউজার মাইক্রোফোন সমর্থন দিচ্ছে না";
  if (kind === "permission_denied") return "মাইক্রোফোন অ্যাক্সেস পাওয়া যায়নি";
  if (kind === "no_speech") return "কথা পরিষ্কার শোনা যায়নি। আবার বলুন।";
  if (kind === "aborted") return "ভয়েস ইনপুট বন্ধ করা হয়েছে";
  return "ভয়েস ইনপুট নেওয়া যায়নি";
}

export function startDualLanguageVoice(
  options: StartDualLanguageVoiceOptions
): VoiceSession | null {
  const recognitionCtor = options.recognitionCtor ?? getSpeechRecognitionCtor();
  if (!recognitionCtor) {
    options.onError?.("not_supported", null);
    return null;
  }

  let activeRecognition: SpeechRecognitionInstance | null = null;
  let cancelled = false;
  let ended = false;

  const finalize = () => {
    if (ended) return;
    ended = true;
    options.onRecognitionRef?.(null);
    options.onEnd?.();
  };

  const stop = () => {
    if (cancelled) return;
    cancelled = true;
    const current = activeRecognition;
    activeRecognition = null;
    if (current) {
      try {
        current.abort?.();
      } catch {
        // ignore
      }
      try {
        current.stop?.();
      } catch {
        // ignore
      }
    }
    finalize();
  };

  const runAttempt = (
    lang: string,
    attempt: VoiceAttempt
  ): Promise<RecognitionResult> =>
    new Promise((resolve) => {
      const recognition = new recognitionCtor();
      let settled = false;
      let bestTranscript = "";
      let silenceTimer: ReturnType<typeof setTimeout> | null = null;

      const resetSilenceTimer = () => {
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          finish({
            transcript: bestTranscript || null,
            errorCode: bestTranscript ? null : "no-speech",
          });
        }, options.interimSilenceMs ?? DEFAULT_INTERIM_SILENCE_MS);
      };

      const finish = (result: RecognitionResult) => {
        if (settled) return;
        settled = true;
        if (silenceTimer) {
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }
        if (activeRecognition === recognition) {
          activeRecognition = null;
          options.onRecognitionRef?.(null);
        }
        resolve(result);
      };

      recognition.lang = lang;
      recognition.interimResults = true;
      recognition.continuous = false;

      recognition.onresult = (event: any) => {
        let finalTranscript = "";
        let interimTranscript = "";

        for (
          let index = event?.resultIndex ?? 0;
          index < (event?.results?.length ?? 0);
          index += 1
        ) {
          const result = event.results[index];
          const transcript = normalizeTranscript(String(result?.[0]?.transcript || ""));
          if (!transcript) continue;
          if (result?.isFinal) {
            finalTranscript = `${finalTranscript} ${transcript}`.trim();
          } else {
            interimTranscript = `${interimTranscript} ${transcript}`.trim();
          }
        }

        const normalizedFinal = normalizeTranscript(finalTranscript);
        const normalizedInterim = normalizeTranscript(interimTranscript);
        if (normalizedInterim && normalizedInterim.length >= bestTranscript.length) {
          bestTranscript = normalizedInterim;
          options.onInterimTranscript?.(normalizedInterim, { lang, attempt });
        }
        if (normalizedFinal) {
          bestTranscript = normalizedFinal;
          finish({ transcript: normalizedFinal, errorCode: null });
          return;
        }
        resetSilenceTimer();
      };

      recognition.onerror = (event: any) => {
        const errorCode =
          typeof event?.error === "string" ? (event.error as string) : "unknown";
        finish({ transcript: null, errorCode });
      };

      recognition.onend = () => {
        finish({ transcript: null, errorCode: null });
      };

      activeRecognition = recognition;
      options.onRecognitionRef?.(recognition);
      resetSilenceTimer();

      try {
        recognition.start();
      } catch {
        finish({ transcript: null, errorCode: "start-failed" });
      }
    });

  const emitError = (errorCode?: string | null) => {
    if (!errorCode) {
      options.onError?.("no_speech", null);
      return;
    }
    if (PERMISSION_ERROR_CODES.has(errorCode)) {
      options.onError?.("permission_denied", errorCode);
      return;
    }
    if (ABORT_ERROR_CODES.has(errorCode)) {
      options.onError?.("aborted", errorCode);
      return;
    }
    if (errorCode === "no-speech") {
      options.onError?.("no_speech", errorCode);
      return;
    }
    options.onError?.("unavailable", errorCode);
  };

  options.onStart?.();
  const primaryLang = options.primaryLang || PRIMARY_LANG;
  const fallbackLang = options.fallbackLang || FALLBACK_LANG;
  const maxAttemptsPerLanguage = Math.max(1, options.maxAttemptsPerLanguage ?? 2);

  async function runLanguageWithRetries(lang: string, attempt: VoiceAttempt) {
    let lastResult: RecognitionResult = { transcript: null, errorCode: null };
    for (let count = 0; count < maxAttemptsPerLanguage; count += 1) {
      lastResult = await runAttempt(lang, attempt);
      if (cancelled) return lastResult;
      if (lastResult.transcript) return lastResult;
      if (
        lastResult.errorCode &&
        (PERMISSION_ERROR_CODES.has(lastResult.errorCode) ||
          ABORT_ERROR_CODES.has(lastResult.errorCode))
      ) {
        return lastResult;
      }
    }
    return lastResult;
  }

  void (async () => {
    const primary = await runLanguageWithRetries(primaryLang, "primary");
    if (cancelled) return;
    if (primary.transcript) {
      options.onTranscript(primary.transcript, {
        lang: primaryLang,
        attempt: "primary",
      });
      finalize();
      return;
    }

    const primaryCode = primary.errorCode;
    if (primaryCode && (PERMISSION_ERROR_CODES.has(primaryCode) || ABORT_ERROR_CODES.has(primaryCode))) {
      emitError(primaryCode);
      finalize();
      return;
    }

    const fallback = await runLanguageWithRetries(fallbackLang, "fallback");
    if (cancelled) return;
    if (fallback.transcript) {
      options.onTranscript(fallback.transcript, {
        lang: fallbackLang,
        attempt: "fallback",
      });
      finalize();
      return;
    }

    emitError(fallback.errorCode || primary.errorCode);
    finalize();
  })();

  return { stop };
}
