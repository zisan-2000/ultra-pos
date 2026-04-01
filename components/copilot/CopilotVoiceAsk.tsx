"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Mic, SendHorizonal, Volume2 } from "lucide-react";
import {
  COPILOT_GROUPED_QUESTION_SUGGESTIONS,
  COPILOT_QUESTION_SUGGESTIONS,
} from "@/lib/copilot-ask";

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type AskResponse = {
  supported: boolean;
  answer: string;
  intent?: string;
  matchedCustomerName?: string | null;
  suggestions?: readonly string[];
};

function stopSpeaking() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
}

export default function CopilotVoiceAsk({
  shopId,
  shopName,
  online,
}: {
  shopId: string;
  shopName?: string | null;
  online: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [speechReady, setSpeechReady] = useState(false);
  const [lastAnswer, setLastAnswer] = useState("");
  const [showMoreSuggestions, setShowMoreSuggestions] = useState(false);
  const [openSuggestionGroup, setOpenSuggestionGroup] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const primarySuggestions = COPILOT_QUESTION_SUGGESTIONS.slice(0, 4);
  const extraSuggestions = COPILOT_QUESTION_SUGGESTIONS.slice(4);

  useEffect(() => {
    const SpeechRecognitionImpl =
      typeof window !== "undefined"
        ? ((window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition)
        : null;
    setVoiceReady(Boolean(SpeechRecognitionImpl));
    setSpeechReady(
      typeof window !== "undefined" &&
        "speechSynthesis" in window &&
        typeof window.SpeechSynthesisUtterance !== "undefined"
    );

    return () => {
      recognitionRef.current?.stop?.();
      stopSpeaking();
    };
  }, []);

  const speakAnswer = useCallback(
    (text?: string | null) => {
      const content = String(text || lastAnswer || "").trim();
      if (!content || !speechReady || typeof window === "undefined") return;
      stopSpeaking();
      const utterance = new window.SpeechSynthesisUtterance(content);
      utterance.lang = "bn-BD";
      utterance.rate = 1;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    },
    [lastAnswer, speechReady]
  );

  const askCopilot = useCallback(
    async (rawQuestion?: string, options?: { speak?: boolean }) => {
      const nextQuestion = String(rawQuestion ?? question).trim();
      if (!nextQuestion) {
        setError("প্রশ্ন লিখুন বা মাইক্রোফোনে বলুন।");
        return;
      }
      if (!online) {
        setError("ভয়েস প্রশ্ন করতে ইন্টারনেট দরকার।");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/owner/copilot/ask", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            shopId,
            question: nextQuestion,
          }),
        });

        if (!response.ok) {
          throw new Error(`http_${response.status}`);
        }

        const payload = (await response.json()) as AskResponse;
        setAnswer(payload.answer);
        setLastAnswer(payload.answer);
        setQuestion(nextQuestion);
        setShowMoreSuggestions(false);
        setOpenSuggestionGroup(null);

        if (options?.speak && payload.answer) {
          window.setTimeout(() => speakAnswer(payload.answer), 120);
        }
      } catch {
        setError("এই মুহূর্তে উত্তর আনা যাচ্ছে না।");
      } finally {
        setLoading(false);
      }
    },
    [online, question, shopId, speakAnswer]
  );

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop?.();
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (listening) {
      stopListening();
      return;
    }

    const SpeechRecognitionImpl =
      typeof window !== "undefined"
        ? ((window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition)
        : null;

    if (!SpeechRecognitionImpl) {
      setVoiceReady(false);
      setError("এই ডিভাইসে voice recognition সাপোর্ট নেই।");
      return;
    }

    const recognition: SpeechRecognitionInstance = new SpeechRecognitionImpl();
    recognition.lang = "bn-BD";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event: any) => {
      const transcript = String(event?.results?.[0]?.[0]?.transcript || "").trim();
      if (!transcript) {
        setError("কথা পরিষ্কার পাওয়া যায়নি। আবার বলুন।");
        return;
      }
      setQuestion(transcript);
      void askCopilot(transcript, { speak: true });
    };
    recognition.onerror = (event: any) => {
      if (event?.error === "not-allowed") {
        setError("মাইক্রোফোন permission প্রয়োজন।");
      } else {
        setError("ভয়েস শোনা যায়নি। আবার চেষ্টা করুন।");
      }
    };
    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    setError(null);
    setListening(true);
    recognition.start();
  }, [askCopilot, listening, stopListening]);

  const helperText = useMemo(() => {
    if (!online) return "অনলাইনে থাকলে voice প্রশ্ন করা যাবে।";
    if (listening) return "শুনছি... প্রশ্ন বলুন।";
    if (voiceReady)
      return "Sales, profit, due, product stock, low stock, top item, payable বা queue নিয়ে প্রশ্ন করুন।";
    return "এই ডিভাইসে মাইক্রোফোন সাপোর্ট নেই, লিখে business প্রশ্ন করুন।";
  }, [listening, online, voiceReady]);

  return (
    <section className="rounded-[24px] border border-border/70 bg-background/80 p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Voice Ask
          </div>
          <h3 className="text-base font-bold text-foreground">
            {shopName ? `${shopName}-কে জিজ্ঞেস করুন` : "দোকানকে জিজ্ঞেস করুন"}
          </h3>
          <p className="text-sm text-muted-foreground">{helperText}</p>
        </div>
        {speechReady && lastAnswer ? (
          <button
            type="button"
            onClick={() => speakAnswer()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border bg-card px-3 text-sm font-semibold text-foreground transition hover:border-primary/30 hover:text-primary"
          >
            <Volume2 className="h-4 w-4" />
            শোনান
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void askCopilot();
              }
            }}
            placeholder="যেমন: আজ দোকান কেমন চলছে? / কোন product-এর stock কত?"
            className="h-12 w-full rounded-2xl border border-border bg-card px-4 pr-12 text-sm text-foreground shadow-sm outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="button"
            onClick={startListening}
            disabled={!online}
            aria-label={listening ? "শোনা বন্ধ করুন" : "মাইক্রোফোনে প্রশ্ন করুন"}
            className={`absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border text-sm transition ${
              listening
                ? "border-primary/40 bg-primary-soft text-primary animate-pulse"
                : "border-border bg-background text-muted-foreground hover:text-primary"
            } ${!online ? "cursor-not-allowed opacity-50" : ""}`}
          >
            <Mic className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => void askCopilot()}
          disabled={loading || !online}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-primary/20 bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
          জিজ্ঞেস
        </button>
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          {primarySuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                setQuestion(suggestion);
                void askCopilot(suggestion);
              }}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary/30 hover:text-primary"
            >
              {suggestion}
            </button>
          ))}
          {extraSuggestions.length > 0 ? (
            <button
              type="button"
              onClick={() =>
                setShowMoreSuggestions((current) => {
                  const next = !current;
                  if (!next) {
                    setOpenSuggestionGroup(null);
                  }
                  return next;
                })
              }
              className="rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary transition hover:border-primary/30 hover:bg-primary/10"
            >
              {showMoreSuggestions ? "কম দেখান" : `আরও ${extraSuggestions.length}টি প্রশ্ন`}
            </button>
          ) : null}
        </div>

        {showMoreSuggestions ? (
          <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-3">
            {COPILOT_GROUPED_QUESTION_SUGGESTIONS.map((group) => (
              <div key={group.label} className="space-y-2">
                <button
                  type="button"
                  onClick={() =>
                    setOpenSuggestionGroup((current) =>
                      current === group.label ? null : group.label
                    )
                  }
                  className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left transition ${
                    openSuggestionGroup === group.label
                      ? "border-primary/25 bg-background text-foreground"
                      : "border-border/70 bg-card/80 text-foreground"
                  }`}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {group.label}
                  </span>
                  <span className="text-xs font-semibold text-primary">
                    {openSuggestionGroup === group.label ? "লুকান" : `${group.questions.length}টি`}
                  </span>
                </button>
                {openSuggestionGroup === group.label ? (
                  <div className="flex flex-wrap gap-2 px-1">
                    {group.questions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => {
                          setQuestion(suggestion);
                          void askCopilot(suggestion);
                        }}
                        className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary/30 hover:text-primary"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {extraSuggestions.length > 0 ? (
              <div className="text-xs text-muted-foreground">
                আরও natural phrasing-এও জিজ্ঞেস করতে পারবেন, যদি supported domain-এর মধ্যে থাকে।
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mt-3 rounded-2xl border border-danger/30 bg-danger-soft/50 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {answer ? (
        <div className="mt-4 rounded-[22px] border border-primary/15 bg-gradient-to-br from-primary-soft/40 via-card to-card p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Copilot Answer
          </div>
          <p className="text-sm leading-7 text-foreground">{answer}</p>
        </div>
      ) : null}
    </section>
  );
}
