"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  type AskResponse,
  type ChatMessage,
  type ResponseMode,
  type SpeechRecognitionInstance,
  buildMessageId,
  getThinkingLabel,
  getVoiceAttemptLabel,
  hasBanglaText,
  stopSpeaking,
  RESPONSE_MODE_STORAGE_KEY,
} from "./copilot-chat-types";

export function useCopilotChat(shopId: string, online: boolean) {
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
  const [openSuggestionGroup, setOpenSuggestionGroup] = useState<string | null>(null);
  const [showSuggestionDrawer, setShowSuggestionDrawer] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const voiceSessionRef = useRef<VoiceSession | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const starterSuggestions = suggestions.slice(0, 6);

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const node = chatScrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior });
  }, []);

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
    if (messages.length === 0 && !pendingAction && !loading) return;
    const timeoutId = window.setTimeout(() => {
      scrollChatToBottom(messages.length > 0 ? "smooth" : "auto");
    }, 40);
    return () => window.clearTimeout(timeoutId);
  }, [loading, messages, pendingAction, scrollChatToBottom]);

  useEffect(() => {
    if (!streamingMessageId) return;
    const targetMessage = messages.find((m) => m.id === streamingMessageId);
    const targetText = targetMessage?.content ?? "";
    if (!targetText || streamingLength >= targetText.length) return;
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
      timers.forEach((t) => window.clearTimeout(t));
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
        setError("ভয়েস প্রশ্ন করতে ইন্টারনেট দরকার।");
        return;
      }

      setLoading(true);
      setError(null);
      setDraftCancelled(false);
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
          headers: { "Content-Type": "application/json" },
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
          setError("কথা পরিষ্কার পাওয়া যায়নি। আবার বলুন।");
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
          setError("মাইক্রোফোন permission প্রয়োজন।");
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

  const confirmAction = useCallback(async () => {
    if (!conversationId || confirmingAction || !pendingAction) return;
    setConfirmingAction(true);
    setError(null);
    try {
      const response = await fetch("/api/owner/copilot/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        throw new Error(payload.error || "Action confirm করা যায়নি");
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
          : "Action confirm করা যায়নি।"
      );
    } finally {
      setConfirmingAction(false);
    }
  }, [conversationId, confirmingAction, pendingAction, shopId]);

  const resetChat = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setAnswer(null);
    setLastAnswer("");
    setQuestion("");
    setSuggestions(COPILOT_QUESTION_SUGGESTIONS);
    setPendingAction(null);
    setDraftCancelled(false);
    setStreamingMessageId(null);
    setStreamingLength(0);
    setVoiceDraft("");
    setVoiceAttemptLabel(null);
    setShowChoiceCompareModal(false);
    setOpenSuggestionGroup(null);
    setShowSuggestionDrawer(false);
    setError(null);
  }, []);

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
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === "assistant") return messages[i];
    }
    return null;
  }, [messages]);

  const [draftCancelled, setDraftCancelled] = useState(false);

  const cancelDraft = useCallback(() => {
    setPendingAction(null);
    setDraftCancelled(true);
    setSuggestions(COPILOT_QUESTION_SUGGESTIONS);
  }, []);

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

  return {
    question,
    setQuestion,
    responseMode,
    setResponseMode,
    answer,
    messages,
    pendingAction,
    setPendingAction,
    confirmingAction,
    streamingMessageId,
    streamingLength,
    loading,
    error,
    listening,
    voiceReady,
    speechReady,
    voiceDraft,
    voiceAttemptLabel,
    loadingStageIndex,
    showChoiceCompareModal,
    setShowChoiceCompareModal,
    lastAnswer,
    suggestions,
    openSuggestionGroup,
    setOpenSuggestionGroup,
    showSuggestionDrawer,
    setShowSuggestionDrawer,
    starterSuggestions,
    chatScrollRef,
    textareaRef,
    scrollChatToBottom,
    speakAnswer,
    askCopilot,
    stopListening,
    startListening,
    confirmAction,
    cancelDraft,
    draftCancelled,
    resetChat,
    helperText,
    latestAssistantMessage,
    followUpSuggestions,
    currentClarificationChoices,
    loadingStages,
  };
}
