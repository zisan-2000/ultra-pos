"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Loader2,
  MessageSquarePlus,
  Mic,
  SendHorizonal,
  Sparkles,
  Volume2,
  Wand2,
} from "lucide-react";
import {
  COPILOT_GROUPED_QUESTION_SUGGESTIONS,
  COPILOT_QUESTION_SUGGESTIONS,
} from "@/lib/copilot-ask";
import {
  getSpeechRecognitionCtor,
  mapVoiceErrorBangla,
  startDualLanguageVoice,
  type VoiceSession,
} from "@/lib/voice-recognition";
import type { OwnerCopilotActionDraft } from "@/lib/owner-copilot-actions";

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
  conversationId?: string;
  requiresConfirmation?: boolean;
  actionDraft?: OwnerCopilotActionDraft | null;
  engine?: string;
  provider?: string;
  model?: string;
  toolNames?: readonly string[];
  fallbackUsed?: boolean;
};

type AssistantTrace = {
  engine?: string;
  provider?: string;
  model?: string;
  toolNames?: readonly string[];
  fallbackUsed?: boolean;
  actionKind?: string;
  requiresConfirmation?: boolean;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: AssistantTrace;
};

function buildMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getEngineLabel(engine?: string) {
  switch (engine) {
    case "llm-tools":
      return "Tool mode";
    case "llm":
      return "LLM";
    case "action-draft":
      return "Draft";
    case "action-confirm":
      return "Executed";
    case "rule":
      return "Rule";
    default:
      return null;
  }
}

function getThinkingLabel(pendingAction: OwnerCopilotActionDraft | null) {
  if (pendingAction) return "Draft confirmation প্রস্তুত হচ্ছে...";
  return "Copilot business context analyse করছে...";
}

function renderActionDetails(pendingAction: OwnerCopilotActionDraft) {
  if (pendingAction.kind === "expense") {
    return [
      { label: "Action", value: "Quick expense" },
      { label: "Amount", value: `৳ ${pendingAction.amount}` },
      { label: "Category", value: pendingAction.category },
      { label: "Note", value: pendingAction.note || "None" },
    ];
  }

  return [
    { label: "Action", value: pendingAction.entryType === "IN" ? "Cash in" : "Cash out" },
    { label: "Amount", value: `৳ ${pendingAction.amount}` },
    { label: "Type", value: pendingAction.entryType },
    { label: "Reason", value: pendingAction.reason || "None" },
  ];
}

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
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingAction, setPendingAction] = useState<OwnerCopilotActionDraft | null>(null);
  const [confirmingAction, setConfirmingAction] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [streamingLength, setStreamingLength] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [speechReady, setSpeechReady] = useState(false);
  const [lastAnswer, setLastAnswer] = useState("");
  const [showMoreSuggestions, setShowMoreSuggestions] = useState(false);
  const [openSuggestionGroup, setOpenSuggestionGroup] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<readonly string[]>(COPILOT_QUESTION_SUGGESTIONS);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const voiceSessionRef = useRef<VoiceSession | null>(null);

  const primarySuggestions = suggestions.slice(0, 4);
  const extraSuggestions = suggestions.slice(4);

  useEffect(() => {
    const SpeechRecognitionImpl = getSpeechRecognitionCtor();
    setVoiceReady(Boolean(SpeechRecognitionImpl));
    setSpeechReady(
      typeof window !== "undefined" &&
        "speechSynthesis" in window &&
        typeof window.SpeechSynthesisUtterance !== "undefined"
    );

    return () => {
      voiceSessionRef.current?.stop();
      voiceSessionRef.current = null;
      recognitionRef.current?.stop?.();
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    setConversationId(null);
    setMessages([]);
    setAnswer(null);
    setLastAnswer("");
    setSuggestions(COPILOT_QUESTION_SUGGESTIONS);
    setShowMoreSuggestions(false);
    setOpenSuggestionGroup(null);
    setPendingAction(null);
    setStreamingMessageId(null);
    setStreamingLength(0);
  }, [shopId]);

  useEffect(() => {
    if (!streamingMessageId) return;

    const targetMessage = messages.find((message) => message.id === streamingMessageId);
    const targetText = targetMessage?.content ?? "";

    if (!targetText || streamingLength >= targetText.length) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setStreamingLength((current) => Math.min(targetText.length, current + 8));
    }, 18);

    return () => window.clearTimeout(timeout);
  }, [messages, streamingLength, streamingMessageId]);

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
            conversationId,
          }),
        });

        if (!response.ok) {
          throw new Error(`http_${response.status}`);
        }

        const payload = (await response.json()) as AskResponse;
        const userMessage: ChatMessage = {
          id: buildMessageId(),
          role: "user",
          content: nextQuestion,
        };
        const assistantMessage: ChatMessage = {
          id: buildMessageId(),
          role: "assistant",
          content: payload.answer,
          trace: {
            engine: payload.engine,
            provider: payload.provider,
            model: payload.model,
            toolNames: payload.toolNames,
            fallbackUsed: payload.fallbackUsed,
            requiresConfirmation: payload.requiresConfirmation,
          },
        };

        setAnswer(payload.answer);
        setLastAnswer(payload.answer);
        setConversationId(payload.conversationId ?? conversationId);
        setMessages((current) => [...current, userMessage, assistantMessage]);
        setStreamingMessageId(assistantMessage.id);
        setStreamingLength(0);
        setSuggestions(
          payload.suggestions && payload.suggestions.length > 0
            ? payload.suggestions
            : COPILOT_QUESTION_SUGGESTIONS
        );
        setPendingAction(payload.requiresConfirmation ? payload.actionDraft ?? null : null);
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
    [conversationId, online, question, shopId, speakAnswer]
  );

  const stopListening = useCallback(() => {
    voiceSessionRef.current?.stop();
    voiceSessionRef.current = null;
    recognitionRef.current?.stop?.();
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (listening) {
      stopListening();
      return;
    }
    voiceSessionRef.current?.stop();
    voiceSessionRef.current = startDualLanguageVoice({
      onRecognitionRef: (recognition) => {
        recognitionRef.current = recognition;
      },
      onTranscript: (transcript) => {
        if (!transcript) {
          setError("কথা পরিষ্কার পাওয়া যায়নি। আবার বলুন।");
          return;
        }
        setQuestion(transcript);
        void askCopilot(transcript, { speak: true });
      },
      onError: (kind) => {
        if (kind === "aborted") return;
        if (kind === "not_supported") {
          setVoiceReady(false);
          setError("এই ডিভাইসে voice recognition সাপোর্ট নেই।");
          return;
        }
        if (kind === "permission_denied") {
          setError("মাইক্রোফোন permission প্রয়োজন।");
          return;
        }
        setError(mapVoiceErrorBangla(kind));
      },
      onEnd: () => {
        setListening(false);
        voiceSessionRef.current = null;
      },
    });
    if (!voiceSessionRef.current) return;
    setError(null);
    setListening(true);
  }, [askCopilot, listening, stopListening]);

  const helperText = useMemo(() => {
    if (!online) return "অনলাইনে থাকলে voice প্রশ্ন করা যাবে।";
    if (listening) return "শুনছি... প্রশ্ন বলুন।";
    if (voiceReady)
      return "Sales, profit, due, product stock, low stock, top item, payable, queue বা follow-up প্রশ্ন করুন।";
    return "এই ডিভাইসে মাইক্রোফোন সাপোর্ট নেই, লিখে business প্রশ্ন করুন।";
  }, [listening, online, voiceReady]);

  const latestAssistantMessage = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === "assistant") {
        return messages[index];
      }
    }
    return null;
  }, [messages]);

  const followUpSuggestions = useMemo(() => {
    if (suggestions.length === 0) return [];
    return suggestions.slice(0, 3);
  }, [suggestions]);

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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setConversationId(null);
                setMessages([]);
                setAnswer(null);
                setLastAnswer("");
                setQuestion("");
                setSuggestions(COPILOT_QUESTION_SUGGESTIONS);
                setShowMoreSuggestions(false);
                setOpenSuggestionGroup(null);
                setPendingAction(null);
                setStreamingMessageId(null);
                setStreamingLength(0);
              }}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border bg-card px-3 text-sm font-semibold text-foreground transition hover:border-primary/30 hover:text-primary"
            >
              <MessageSquarePlus className="h-4 w-4" />
              নতুন চ্যাট
            </button>
            <button
              type="button"
              onClick={() => speakAnswer()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border bg-card px-3 text-sm font-semibold text-foreground transition hover:border-primary/30 hover:text-primary"
            >
              <Volume2 className="h-4 w-4" />
              শোনান
            </button>
          </div>
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

      {messages.length > 0 ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Conversation
            </div>
            {latestAssistantMessage?.trace?.engine ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1 text-[11px] font-semibold text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                {getEngineLabel(latestAssistantMessage.trace.engine)}
              </div>
            ) : null}
          </div>
          {messages.map((message, index) => (
            <div
              key={message.id}
              className={`rounded-[22px] border p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)] ${
                message.role === "assistant"
                  ? "border-primary/15 bg-gradient-to-br from-primary-soft/40 via-card to-card"
                  : "border-border/70 bg-card"
              }`}
            >
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {message.role === "assistant" ? "Copilot" : "You"}
              </div>
              <p className="text-sm leading-7 text-foreground">
                {message.role === "assistant" && message.id === streamingMessageId
                  ? message.content.slice(0, streamingLength || 1)
                  : message.content}
              </p>
              {message.role === "assistant" && message.trace ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.trace.engine ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/15 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                      <Bot className="h-3 w-3" />
                      {getEngineLabel(message.trace.engine)}
                    </span>
                  ) : null}
                  {message.trace.toolNames?.map((toolName) => (
                    <span
                      key={toolName}
                      className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground"
                    >
                      <Wand2 className="h-3 w-3 text-primary" />
                      {toolName}
                    </span>
                  ))}
                  {message.trace.provider ? (
                    <span className="inline-flex rounded-full border border-border/70 bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                      {message.trace.provider}
                    </span>
                  ) : null}
                  {message.trace.fallbackUsed ? (
                    <span className="inline-flex rounded-full border border-warning/20 bg-warning-soft/50 px-2.5 py-1 text-[11px] font-semibold text-foreground">
                      fallback
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
          {loading ? (
            <div className="rounded-[22px] border border-primary/15 bg-gradient-to-br from-primary-soft/30 via-card to-card p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Copilot
              </div>
              <div className="flex items-center gap-3 text-sm text-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                {getThinkingLabel(pendingAction)}
              </div>
            </div>
          ) : null}
        </div>
      ) : answer ? (
        <div className="mt-4 rounded-[22px] border border-primary/15 bg-gradient-to-br from-primary-soft/40 via-card to-card p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Copilot Answer
          </div>
          <p className="text-sm leading-7 text-foreground">{answer}</p>
        </div>
      ) : null}

      {pendingAction ? (
        <div className="mt-4 rounded-[22px] border border-primary/20 bg-primary-soft/25 p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Confirmation Needed
            </div>
            <span className="inline-flex rounded-full border border-primary/20 bg-card px-2.5 py-1 text-[11px] font-semibold text-primary">
              Nothing saved yet
            </span>
          </div>
          <p className="text-sm leading-7 text-foreground">{pendingAction.confirmationText}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {renderActionDetails(pendingAction).map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-border/60 bg-card px-3 py-3 text-sm text-foreground"
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {item.label}
                </div>
                <div className="mt-1 font-semibold text-foreground">{item.value}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-2xl border border-border/60 bg-card px-3 py-3 text-sm text-foreground">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Summary
            </div>
            <div className="mt-1">{pendingAction.summary}</div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={async () => {
                if (!conversationId || confirmingAction) return;
                setConfirmingAction(true);
                setError(null);
                try {
                  const response = await fetch("/api/owner/copilot/confirm", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      shopId,
                      conversationId,
                      actionDraft: pendingAction,
                    }),
                  });

                  const payload = (await response.json()) as {
                    success?: boolean;
                    answer?: string;
                    error?: string;
                    conversationId?: string;
                    engine?: string;
                    actionKind?: string;
                    suggestions?: readonly string[];
                  };

                  if (!response.ok || !payload.success || !payload.answer) {
                    throw new Error(payload.error || "Action confirm করা যায়নি");
                  }

                  const confirmedAnswer = payload.answer;
                  const confirmedAssistantMessage: ChatMessage = {
                    id: buildMessageId(),
                    role: "assistant",
                    content: confirmedAnswer,
                    trace: {
                      engine: payload.engine,
                      actionKind: payload.actionKind,
                    },
                  };

                  setConversationId(payload.conversationId ?? conversationId);
                  setMessages((current) => [
                    ...current,
                    {
                      id: buildMessageId(),
                      role: "user",
                      content: `Confirm: ${pendingAction.summary}`,
                    },
                    confirmedAssistantMessage,
                  ]);
                  setStreamingMessageId(confirmedAssistantMessage.id);
                  setStreamingLength(0);
                  setAnswer(confirmedAnswer);
                  setLastAnswer(confirmedAnswer);
                  setSuggestions(
                    payload.suggestions && payload.suggestions.length > 0
                      ? payload.suggestions
                      : COPILOT_QUESTION_SUGGESTIONS
                  );
                  setPendingAction(null);
                } catch (actionError) {
                  setError(
                    actionError instanceof Error
                      ? actionError.message
                      : "Action confirm করা যায়নি।"
                  );
                } finally {
                  setConfirmingAction(false);
                }
              }}
              disabled={confirmingAction}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {confirmingAction ? "Confirm হচ্ছে..." : pendingAction.kind === "expense" ? "Expense Save করুন" : "Entry Save করুন"}
            </button>
            <button
              type="button"
              onClick={() => setPendingAction(null)}
              disabled={confirmingAction}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {messages.length > 0 && followUpSuggestions.length > 0 && !pendingAction ? (
        <div className="mt-4 rounded-[22px] border border-border/70 bg-muted/20 p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Suggested Follow-ups
          </div>
          <div className="flex flex-wrap gap-2">
            {followUpSuggestions.map((suggestion) => (
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
        </div>
      ) : null}
    </section>
  );
}
