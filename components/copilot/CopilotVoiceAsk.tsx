"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  ChevronRight,
  Loader2,
  MessageSquarePlus,
  Mic,
  SendHorizonal,
  Sparkles,
  Volume2,
  VolumeX,
  Waves,
  X,
} from "lucide-react";
import {
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
  clarificationChoices?: readonly ClarificationChoice[];
  conversationId?: string;
  requiresConfirmation?: boolean;
  actionDraft?: OwnerCopilotActionDraft | null;
  engine?: string;
  provider?: string;
  model?: string;
  toolNames?: readonly string[];
  fallbackUsed?: boolean;
  responseMode?: ResponseMode;
};

type ResponseMode = "auto" | "verified" | "fast";

type AssistantTrace = {
  engine?: string;
  provider?: string;
  model?: string;
  toolNames?: readonly string[];
  fallbackUsed?: boolean;
  actionKind?: string;
  requiresConfirmation?: boolean;
  responseMode?: ResponseMode;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: AssistantTrace;
  clarificationChoices?: readonly ClarificationChoice[];
};

type ClarificationChoice = {
  prompt: string;
  title: string;
  subtitle?: string;
  badge?: string;
  details?: ReadonlyArray<{
    label: string;
    value: string;
  }>;
};

function buildMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const RESPONSE_MODE_STORAGE_KEY = "owner-copilot-response-mode";

const RESPONSE_MODE_OPTIONS: Array<{
  value: ResponseMode;
  label: string;
  description: string;
}> = [
  {
    value: "auto",
    label: "Auto",
    description: "সবচেয়ে balanced অভিজ্ঞতা",
  },
  {
    value: "verified",
    label: "ডাটা দিয়ে যাচাই",
    description: "যেখানে সম্ভব shop data আগে দেখা হবে",
  },
  {
    value: "fast",
    label: "দ্রুত উত্তর",
    description: "সহজ প্রশ্নে দ্রুত উত্তরকে অগ্রাধিকার",
  },
];

function getTraceStatusLabel(engine?: string) {
  switch (engine) {
    case "llm-tools":
    case "rule":
      return "ডাটা দিয়ে যাচাই করা";
    case "llm":
      return "AI উত্তর";
    case "action-draft":
      return "Confirm দরকার";
    case "action-confirm":
      return "কাজ সম্পন্ন";
    case "action-clarification":
      return "আরও তথ্য দরকার";
    case "blocked":
      return "এখন unavailable";
    default:
      return null;
  }
}

function getThinkingLabel(
  pendingAction: OwnerCopilotActionDraft | null,
  responseMode: ResponseMode
) {
  if (pendingAction) return "Draft confirmation প্রস্তুত হচ্ছে...";
  if (responseMode === "verified") {
    return "দোকানের ডাটা দেখে উত্তর প্রস্তুত হচ্ছে...";
  }
  if (responseMode === "fast") {
    return "দ্রুত উত্তর প্রস্তুত হচ্ছে...";
  }
  return "প্রশ্ন, context আর ডাটা মিলিয়ে উত্তর প্রস্তুত হচ্ছে...";
}

function hasBanglaText(value: string) {
  return /[\u0980-\u09FF]/.test(value);
}

function getVoiceAttemptLabel(lang?: string) {
  if (lang?.toLowerCase().startsWith("bn")) return "Bangla listening";
  if (lang?.toLowerCase().startsWith("en")) return "English fallback listening";
  return "Voice listening";
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

  if (pendingAction.kind === "due_collection") {
    return [
      { label: "Action", value: "Due collection" },
      { label: "Customer", value: pendingAction.customerName },
      { label: "Amount", value: `৳ ${pendingAction.amount}` },
      { label: "Note", value: pendingAction.note || "None" },
    ];
  }

  if (pendingAction.kind === "due_entry") {
    return [
      { label: "Action", value: "Due entry" },
      { label: "Customer", value: pendingAction.customerName },
      { label: "Amount", value: `৳ ${pendingAction.amount}` },
      { label: "Note", value: pendingAction.note || "None" },
    ];
  }

  if (pendingAction.kind === "supplier_payment") {
    return [
      { label: "Action", value: "Supplier payment" },
      { label: "Supplier", value: pendingAction.supplierName },
      { label: "Amount", value: `৳ ${pendingAction.amount}` },
      { label: "Method", value: pendingAction.method || "cash" },
      { label: "Note", value: pendingAction.note || "None" },
    ];
  }

  if (pendingAction.kind === "stock_adjustment") {
    return [
      { label: "Action", value: "Stock adjustment" },
      { label: "Product", value: pendingAction.productQuery },
      { label: "Target stock", value: pendingAction.targetStock },
      { label: "Note", value: pendingAction.note || "None" },
    ];
  }

  if (pendingAction.kind === "product_price_update") {
    return [
      { label: "Action", value: "Price update" },
      { label: "Product", value: pendingAction.productQuery },
      { label: "New price", value: `৳ ${pendingAction.targetPrice}` },
      { label: "Note", value: pendingAction.note || "None" },
    ];
  }

  if (pendingAction.kind === "product_toggle_active") {
    return [
      { label: "Action", value: pendingAction.nextActiveState ? "Activate product" : "Deactivate product" },
      { label: "Product", value: pendingAction.productQuery },
      { label: "Next state", value: pendingAction.nextActiveState ? "Active" : "Inactive" },
    ];
  }

  if (pendingAction.kind === "void_sale") {
    return [
      { label: "Action", value: "Void sale" },
      { label: "Invoice", value: pendingAction.invoiceNo || pendingAction.saleQuery },
      { label: "Reason", value: pendingAction.note || "No reason" },
    ];
  }

  if (pendingAction.kind === "create_customer") {
    return [
      { label: "Action", value: "Create customer" },
      { label: "Name", value: pendingAction.name },
      { label: "Phone", value: pendingAction.phone || "None" },
    ];
  }

  if (pendingAction.kind === "create_supplier") {
    return [
      { label: "Action", value: "Create supplier" },
      { label: "Name", value: pendingAction.name },
      { label: "Phone", value: pendingAction.phone || "None" },
    ];
  }

  if (pendingAction.kind === "create_product") {
    return [
      { label: "Action", value: "Create product" },
      { label: "Name", value: pendingAction.name },
      { label: "Sell price", value: `৳ ${pendingAction.sellPrice}` },
      { label: "Category", value: pendingAction.category || "Uncategorized" },
      { label: "Base unit", value: pendingAction.baseUnit || "pcs" },
      { label: "Opening stock", value: pendingAction.stockQty || "0" },
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

function getConfirmButtonLabel(pendingAction: OwnerCopilotActionDraft, confirmingAction: boolean) {
  if (confirmingAction) return "Confirm হচ্ছে...";

  switch (pendingAction.kind) {
    case "expense":
      return "Expense Save করুন";
    case "cash_entry":
      return "Entry Save করুন";
    case "due_collection":
      return "Payment Collect করুন";
    case "due_entry":
      return "Due Add করুন";
    case "supplier_payment":
      return "Payment Submit করুন";
    case "stock_adjustment":
      return "Stock Update করুন";
    case "product_price_update":
      return "Price Update করুন";
    case "product_toggle_active":
      return pendingAction.nextActiveState ? "Product Activate করুন" : "Product Deactivate করুন";
    case "void_sale":
      return "Sale Void করুন";
    case "create_customer":
      return "Customer Create করুন";
    case "create_supplier":
      return "Supplier Create করুন";
    case "create_product":
      return "Product Create করুন";
    default:
      return "Confirm করুন";
  }
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
  const [responseMode, setResponseMode] = useState<ResponseMode>("auto");
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
  const [voiceDraft, setVoiceDraft] = useState("");
  const [voiceAttemptLabel, setVoiceAttemptLabel] = useState<string | null>(null);
  const [loadingStageIndex, setLoadingStageIndex] = useState(0);
  const [showChoiceCompareModal, setShowChoiceCompareModal] = useState(false);
  const [lastAnswer, setLastAnswer] = useState("");
  const [suggestions, setSuggestions] = useState<readonly string[]>(COPILOT_QUESTION_SUGGESTIONS);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const voiceSessionRef = useRef<VoiceSession | null>(null);

  const starterSuggestions = suggestions.slice(0, 6);

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
    if (typeof window === "undefined") return;
    const storedMode = window.localStorage.getItem(RESPONSE_MODE_STORAGE_KEY);
    if (storedMode === "auto" || storedMode === "verified" || storedMode === "fast") {
      setResponseMode(storedMode);
    }
  }, []);

  useEffect(() => {
    setConversationId(null);
    setMessages([]);
    setAnswer(null);
    setLastAnswer("");
    setSuggestions(COPILOT_QUESTION_SUGGESTIONS);
    setPendingAction(null);
    setStreamingMessageId(null);
    setStreamingLength(0);
    setVoiceDraft("");
    setVoiceAttemptLabel(null);
    setShowChoiceCompareModal(false);
  }, [shopId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(RESPONSE_MODE_STORAGE_KEY, responseMode);
  }, [responseMode]);

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
      utterance.lang = hasBanglaText(content) ? "bn-BD" : "en-US";
      utterance.rate = 1;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    },
    [lastAnswer, speechReady]
  );

  useEffect(() => {
    if (!loading) {
      setLoadingStageIndex(0);
      return;
    }

    const timers = [
      window.setTimeout(() => setLoadingStageIndex(1), 650),
      window.setTimeout(() => setLoadingStageIndex(2), 1450),
    ];

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [loading]);

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
      setShowChoiceCompareModal(false);
      const userMessage: ChatMessage = {
        id: buildMessageId(),
        role: "user",
        content: nextQuestion,
      };
      setMessages((current) => [...current, userMessage]);

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
            responseMode,
          }),
        });

        if (!response.ok) {
          throw new Error(`http_${response.status}`);
        }

        const payload = (await response.json()) as AskResponse;
        const assistantMessage: ChatMessage = {
          id: buildMessageId(),
          role: "assistant",
          content: payload.answer,
          clarificationChoices: payload.clarificationChoices ?? [],
          trace: {
            engine: payload.engine,
            provider: payload.provider,
            model: payload.model,
            toolNames: payload.toolNames,
            fallbackUsed: payload.fallbackUsed,
            requiresConfirmation: payload.requiresConfirmation,
            responseMode: payload.responseMode ?? responseMode,
          },
        };

        setAnswer(payload.answer);
        setLastAnswer(payload.answer);
        setConversationId(payload.conversationId ?? conversationId);
        setMessages((current) => [...current, assistantMessage]);
        setStreamingMessageId(assistantMessage.id);
        setStreamingLength(0);
        setSuggestions(
          payload.suggestions && payload.suggestions.length > 0
            ? payload.suggestions
            : COPILOT_QUESTION_SUGGESTIONS
        );
        setPendingAction(payload.requiresConfirmation ? payload.actionDraft ?? null : null);
        setQuestion(nextQuestion);

        if (options?.speak && payload.answer) {
          window.setTimeout(() => speakAnswer(payload.answer), 120);
        }
      } catch {
        setMessages((current) => current.slice(0, -1));
        setError("এই মুহূর্তে উত্তর আনা যাচ্ছে না।");
      } finally {
        setLoading(false);
      }
    },
    [conversationId, online, question, responseMode, shopId, speakAnswer]
  );

  const stopListening = useCallback(() => {
    voiceSessionRef.current?.stop();
    voiceSessionRef.current = null;
    recognitionRef.current?.stop?.();
    setListening(false);
    setVoiceDraft("");
    setVoiceAttemptLabel(null);
  }, []);

  const startListening = useCallback(() => {
    if (listening) {
      stopListening();
      return;
    }
    voiceSessionRef.current?.stop();
    voiceSessionRef.current = startDualLanguageVoice({
      maxAttemptsPerLanguage: 2,
      interimSilenceMs: 2200,
      onRecognitionRef: (recognition) => {
        recognitionRef.current = recognition;
      },
      onInterimTranscript: (transcript, context) => {
        setVoiceDraft(transcript);
        setVoiceAttemptLabel(getVoiceAttemptLabel(context.lang));
        if (transcript.trim()) {
          setQuestion(transcript.trim());
        }
      },
      onTranscript: (transcript, context) => {
        if (!transcript) {
          setError("কথা পরিষ্কার পাওয়া যায়নি। আবার বলুন।");
          return;
        }
        setVoiceDraft(transcript);
        setVoiceAttemptLabel(getVoiceAttemptLabel(context.lang));
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
        setVoiceAttemptLabel(null);
      },
    });
    if (!voiceSessionRef.current) return;
    setError(null);
    setListening(true);
    setVoiceDraft("");
  }, [askCopilot, listening, stopListening]);

  const helperText = useMemo(() => {
    if (!online) return "অনলাইনে থাকলে voice প্রশ্ন করা যাবে।";
    if (listening) {
      return voiceDraft
        ? "শোনা টেক্সট review হচ্ছে। চুপ থাকুন, final transcript ধরা হচ্ছে..."
        : "শুনছি... মাইক্রোফোনের কাছে থেকে ছোট করে প্রশ্ন বলুন।";
    }
    if (voiceReady)
      return "Sales, profit, due, product stock, low stock, top item, payable, queue বা follow-up প্রশ্ন করুন।";
    return "এই ডিভাইসে মাইক্রোফোন সাপোর্ট নেই, লিখে business প্রশ্ন করুন।";
  }, [listening, online, voiceDraft, voiceReady]);

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

  const currentClarificationChoices = useMemo(
    () => latestAssistantMessage?.clarificationChoices ?? [],
    [latestAssistantMessage]
  );

  const loadingStages = useMemo(() => {
    if (pendingAction) {
      return ["Intent বুঝছি", "Exact entity resolve করছি", "Confirmation card বানাচ্ছি"];
    }
    if (responseMode === "verified") {
      return ["প্রশ্ন বুঝছি", "Shop data যাচাই করছি", "স্পষ্ট উত্তর লিখছি"];
    }
    if (responseMode === "fast") {
      return ["প্রশ্ন ধরছি", "Fast path check করছি", "সংক্ষিপ্ত উত্তর লিখছি"];
    }
    return ["প্রশ্ন বুঝছি", "Relevant data/context মিলাচ্ছি", "Natural answer লিখছি"];
  }, [pendingAction, responseMode]);

  return (
    <section className="flex h-[min(78vh,760px)] min-h-[620px] flex-col overflow-hidden rounded-[28px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(249,250,251,0.96))] shadow-[0_18px_45px_rgba(15,23,42,0.07)] backdrop-blur">
      <div className="flex items-start justify-between gap-3 border-b border-border/70 px-4 py-4 sm:px-5">
        <div className="min-w-0 space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Copilot
          </div>
          <h3 className="truncate text-base font-bold text-foreground">
            {shopName ? `${shopName}-কে জিজ্ঞেস করুন` : "দোকানকে জিজ্ঞেস করুন"}
          </h3>
          <p className="text-sm text-muted-foreground">{helperText}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {RESPONSE_MODE_OPTIONS.map((option) => {
            const active = responseMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setResponseMode(option.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border/70 bg-card text-muted-foreground hover:border-primary/20 hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            );
          })}
          {speechReady && lastAnswer ? (
            <button
              type="button"
              onClick={() => speakAnswer()}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:border-primary/30 hover:text-primary"
              aria-label="উত্তর শোনান"
            >
              <Volume2 className="h-4 w-4" />
            </button>
          ) : null}
          {speechReady && lastAnswer ? (
            <button
              type="button"
              onClick={() => stopSpeaking()}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:border-primary/30 hover:text-primary"
              aria-label="শোনা থামান"
            >
              <VolumeX className="h-4 w-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setConversationId(null);
              setMessages([]);
              setAnswer(null);
              setLastAnswer("");
              setQuestion("");
              setSuggestions(COPILOT_QUESTION_SUGGESTIONS);
              setPendingAction(null);
              setStreamingMessageId(null);
              setStreamingLength(0);
              setVoiceDraft("");
              setVoiceAttemptLabel(null);
              setShowChoiceCompareModal(false);
              setError(null);
            }}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground transition hover:border-primary/30 hover:text-primary"
          >
            <MessageSquarePlus className="h-4 w-4" />
            নতুন চ্যাট
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        {error ? (
          <div className="mb-4 rounded-2xl border border-danger/30 bg-danger-soft/50 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        ) : null}

        {messages.length === 0 && !loading ? (
          <div className="flex min-h-full flex-col items-center justify-center py-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-primary/15 bg-primary-soft/30 text-primary">
              <Bot className="h-6 w-6" />
            </div>
            <h4 className="mt-4 text-xl font-semibold text-foreground">
              দোকানের যেকোনো গুরুত্বপূর্ণ প্রশ্ন করুন
            </h4>
            <p className="mt-2 max-w-xl text-sm leading-7 text-muted-foreground">
              sales, profit, due, stock, payable, customer, supplier বা quick action draft নিয়ে natural ভাষায় লিখুন।
            </p>
            <div className="mt-6 flex max-w-3xl flex-wrap justify-center gap-2">
              {starterSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setQuestion(suggestion);
                    void askCopilot(suggestion);
                  }}
                  className="rounded-full border border-border/70 bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary/30 hover:text-primary"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-4xl flex-col gap-4">
            {messages.map((message) => {
              const isAssistant = message.role === "assistant";
              const content =
                isAssistant && message.id === streamingMessageId
                  ? message.content.slice(0, streamingLength || 1)
                  : message.content;

              return (
                <div
                  key={message.id}
                  className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`max-w-[88%] rounded-[24px] px-4 py-3 sm:max-w-[78%] ${
                      isAssistant
                        ? "border border-border/70 bg-card text-foreground shadow-sm"
                        : "bg-primary text-primary-foreground shadow-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap text-sm leading-7">{content}</p>
                    {isAssistant && message.trace ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {message.trace.engine ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                            <Sparkles className="h-3 w-3 text-primary" />
                            {getTraceStatusLabel(message.trace.engine)}
                          </span>
                        ) : null}
                        {message.trace.fallbackUsed ? (
                          <span className="inline-flex rounded-full border border-warning/20 bg-warning-soft/50 px-2.5 py-1 text-[11px] font-semibold text-foreground">
                            বিকল্প পথে উত্তর
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}

            {loading ? (
              <div className="flex justify-start">
                <div className="max-w-[88%] rounded-[24px] border border-border/70 bg-card px-4 py-3 text-foreground shadow-sm sm:max-w-[78%]">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <div className="space-y-1">
                      <div className="text-sm">{getThinkingLabel(pendingAction, responseMode)}</div>
                      <div className="text-xs text-muted-foreground">
                        {loadingStages[Math.min(loadingStageIndex, loadingStages.length - 1)]}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {pendingAction ? (
              <div className="rounded-[24px] border border-primary/20 bg-primary-soft/20 p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-foreground">Confirm করার আগে review করুন</div>
                  <span className="inline-flex rounded-full border border-primary/20 bg-card px-2.5 py-1 text-[11px] font-semibold text-primary">
                    Confirm না করা পর্যন্ত কিছু save হবে না
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
                      <div className="mt-1 font-semibold">{item.value}</div>
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
                    {getConfirmButtonLabel(pendingAction, confirmingAction)}
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

            {messages.length > 0 &&
            latestAssistantMessage?.trace?.engine === "action-clarification" &&
            (currentClarificationChoices.length > 0 || suggestions.length > 0) &&
            !pendingAction ? (
              <div className="rounded-[24px] border border-border/70 bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Exact option বেছে নিন</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      একাধিক match থাকলে নিচের card থেকে exact item select করুন।
                    </div>
                  </div>
                  {currentClarificationChoices.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setShowChoiceCompareModal(true)}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-border bg-background px-3 text-xs font-semibold text-foreground transition hover:border-primary/30 hover:text-primary"
                    >
                      Compare all
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                {currentClarificationChoices.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {currentClarificationChoices.slice(0, 4).map((choice) => (
                      <div
                        key={choice.prompt}
                        className="rounded-2xl border border-border/70 bg-background p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-foreground">{choice.title}</div>
                            {choice.subtitle ? (
                              <div className="mt-1 text-xs text-muted-foreground">{choice.subtitle}</div>
                            ) : null}
                          </div>
                          {choice.badge ? (
                            <span className="inline-flex rounded-full border border-primary/15 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                              {choice.badge}
                            </span>
                          ) : null}
                        </div>
                        {choice.details && choice.details.length > 0 ? (
                          <div className="mt-3 grid gap-2">
                            {choice.details.slice(0, 3).map((detail) => (
                              <div
                                key={`${choice.prompt}-${detail.label}`}
                                className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-3 py-2 text-xs"
                              >
                                <span className="font-semibold text-muted-foreground">{detail.label}</span>
                                <span className="text-right font-medium text-foreground">{detail.value}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setQuestion(choice.prompt);
                            setShowChoiceCompareModal(false);
                            void askCopilot(choice.prompt);
                          }}
                          className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-2xl border border-primary/20 bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-95"
                        >
                          এই option নিন
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {suggestions.slice(0, 4).map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => {
                          setQuestion(suggestion);
                          void askCopilot(suggestion);
                        }}
                        className="rounded-2xl border border-border/70 bg-background px-4 py-3 text-left text-sm font-medium text-foreground transition hover:border-primary/30 hover:text-primary"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {messages.length > 0 && followUpSuggestions.length > 0 && !pendingAction ? (
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
            ) : null}
          </div>
        )}
      </div>

      <div className="border-t border-border/70 bg-background/95 px-4 py-4 backdrop-blur sm:px-5">
        <div className="mx-auto max-w-4xl space-y-3">
          {(listening || voiceDraft) && online ? (
            <div className="rounded-2xl border border-primary/20 bg-primary-soft/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/20 bg-card text-primary">
                    <Waves className={`h-4 w-4 ${listening ? "animate-pulse" : ""}`} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      {listening ? "Voice capture চলছে" : "শেষ transcript ধরা হয়েছে"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {voiceAttemptLabel || "Bangla first, English fallback"}
                    </div>
                  </div>
                </div>
                {listening ? (
                  <button
                    type="button"
                    onClick={stopListening}
                    className="inline-flex h-9 items-center justify-center rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground transition hover:border-primary/30 hover:text-primary"
                  >
                    Stop
                  </button>
                ) : null}
              </div>
              <div className="mt-3 rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm leading-7 text-foreground">
                {voiceDraft || "শুনছি..."}
              </div>
            </div>
          ) : null}

          <div className="rounded-[26px] border border-border/80 bg-card shadow-sm">
            <div className="flex items-end gap-2 px-3 py-3">
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void askCopilot();
                  }
                }}
                placeholder="আজ দোকান কেমন চলছে? / কোন product-এর stock কত?"
                rows={1}
                className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <div className="flex items-center gap-2 pb-1">
                <button
                  type="button"
                  onClick={listening ? stopListening : startListening}
                  disabled={!online}
                  aria-label={listening ? "শোনা বন্ধ করুন" : "মাইক্রোফোনে প্রশ্ন করুন"}
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${
                    listening
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-primary"
                  } ${!online ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  <Mic className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void askCopilot()}
                  disabled={loading || !online || !question.trim()}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-primary/20 bg-primary text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="জিজ্ঞেস করুন"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <SendHorizonal className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {messages.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {starterSuggestions.slice(0, 3).map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setQuestion(suggestion);
                    void askCopilot(suggestion);
                  }}
                  className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/30 hover:text-primary"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {showChoiceCompareModal && currentClarificationChoices.length > 0 ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[28px] border border-border/70 bg-background shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
            <div className="flex items-start justify-between gap-4 border-b border-border/70 px-5 py-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Compare Options
                </div>
                <h4 className="mt-1 text-xl font-bold text-foreground">
                  Exact match বেছে নিন
                </h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  ambiguous customer / supplier / product / invoice case compare করে exact one choose করুন।
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowChoiceCompareModal(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:border-primary/30 hover:text-primary"
                aria-label="Close compare modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[calc(90vh-88px)] overflow-y-auto p-5">
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {currentClarificationChoices.map((choice) => (
                  <div
                    key={choice.prompt}
                    className="rounded-[24px] border border-border/70 bg-card p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-bold text-foreground">{choice.title}</div>
                        {choice.subtitle ? (
                          <div className="mt-1 text-sm text-muted-foreground">{choice.subtitle}</div>
                        ) : null}
                      </div>
                      {choice.badge ? (
                        <span className="inline-flex rounded-full border border-primary/15 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                          {choice.badge}
                        </span>
                      ) : null}
                    </div>
                    {choice.details && choice.details.length > 0 ? (
                      <div className="mt-4 space-y-2">
                        {choice.details.map((detail) => (
                          <div
                            key={`${choice.prompt}-${detail.label}`}
                            className="rounded-2xl border border-border/60 bg-background/80 px-3 py-3"
                          >
                            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                              {detail.label}
                            </div>
                            <div className="mt-1 text-sm font-semibold text-foreground">
                              {detail.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setQuestion(choice.prompt);
                        setShowChoiceCompareModal(false);
                        void askCopilot(choice.prompt);
                      }}
                      className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-primary/20 bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-95"
                    >
                      এই option confirm করুন
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
