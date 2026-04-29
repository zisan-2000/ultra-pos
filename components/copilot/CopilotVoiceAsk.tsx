"use client";

import {
  ChevronRight,
  Loader2,
  MessageSquarePlus,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  RESPONSE_MODE_OPTIONS,
  getTraceStatusLabel,
  getThinkingLabel,
  stopSpeaking,
} from "./copilot-chat-types";
import { useCopilotChat } from "./useCopilotChat";
import { ActionDraftCard } from "./ActionDraftCard";
import { CompareChoicesModal } from "./CompareChoicesModal";
import { CopilotInput } from "./CopilotInput";
import { SuggestionAccordion } from "./SuggestionAccordion";

export default function CopilotVoiceAsk({
  shopId,
  shopName,
  online,
}: {
  shopId: string;
  shopName?: string | null;
  online: boolean;
}) {
  const chat = useCopilotChat(shopId, online);

  return (
    <section className="relative flex h-full min-h-0 w-full max-w-full flex-col overflow-x-hidden overflow-y-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
      {/* Header */}
      <div className="border-b border-border px-3 py-3 sm:px-5 sm:py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <div className="hidden text-xs font-semibold uppercase tracking-widest text-muted-foreground sm:block">
              Copilot
            </div>
            <h3 className="truncate pr-2 text-sm font-bold text-foreground sm:text-base">
              {shopName ? `${shopName}-কে জিজ্ঞেস করুন` : "দোকানকে জিজ্ঞেস করুন"}
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {chat.speechReady && chat.lastAnswer ? (
              <>
                <button
                  type="button"
                  onClick={() => chat.speakAnswer()}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground transition hover:border-primary/20 hover:text-primary sm:h-9 sm:w-9"
                  aria-label="উত্তর শোনান"
                >
                  <Volume2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => stopSpeaking()}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground transition hover:border-primary/20 hover:text-primary sm:h-9 sm:w-9"
                  aria-label="শোনা থামান"
                >
                  <VolumeX className="h-4 w-4" />
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={chat.resetChat}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-border/70 bg-card px-3 text-xs font-semibold text-foreground transition hover:border-primary/20 hover:text-primary sm:h-9 sm:gap-2 sm:px-3"
            >
              <MessageSquarePlus className="h-4 w-4" />
              <span className="sm:hidden">নতুন</span>
              <span className="hidden sm:inline">নতুন চ্যাট</span>
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {RESPONSE_MODE_OPTIONS.map((option) => {
            const active = chat.responseMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => chat.setResponseMode(option.value)}
                className={`min-w-0 rounded-full border px-3 py-1 text-xs font-semibold transition sm:py-1.5 ${
                  active
                    ? "border-primary/20 bg-primary/10 text-primary"
                    : "border-border/70 bg-card text-muted-foreground hover:border-primary/20 hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat scroll area */}
      <div
        ref={chat.chatScrollRef}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-3 sm:px-5 sm:py-4"
      >
        {chat.error ? (
          <div className="mb-4 rounded-xl border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">
            {chat.error}
          </div>
        ) : null}

        {chat.messages.length === 0 && !chat.loading ? (
          <div className="flex min-h-full flex-col justify-center py-3 text-center sm:py-6">
            <div className="mx-auto max-w-xl px-2">
              <h4 className="text-base font-semibold text-foreground sm:text-lg">
                আজ কী জানতে চান?
              </h4>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                sales, stock, due বা quick action নিয়ে লিখুন।
              </p>
            </div>
            <div className="mt-4 flex max-w-3xl flex-wrap justify-center gap-2">
              {chat.starterSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    chat.setQuestion(suggestion);
                    void chat.askCopilot(suggestion);
                  }}
                  className="max-w-full rounded-full border border-border/70 bg-card px-3 py-2 text-sm font-medium text-foreground transition hover:border-primary/20 hover:text-primary"
                >
                  <span className="block max-w-full truncate sm:whitespace-normal">{suggestion}</span>
                </button>
              ))}
            </div>
            <div className="mt-5 w-full max-w-3xl">
              <SuggestionAccordion
                openGroup={chat.openSuggestionGroup}
                onOpenGroupChange={chat.setOpenSuggestionGroup}
                onSelectSuggestion={(text) => {
                  chat.setShowSuggestionDrawer(false);
                  chat.setQuestion(text);
                  void chat.askCopilot(text);
                }}
              />
            </div>
          </div>
        ) : (
          <div className="mx-auto flex min-w-0 max-w-4xl flex-col gap-3 sm:gap-4">
            {chat.messages.map((message) => {
              const isAssistant = message.role === "assistant";
              const content =
                isAssistant && message.id === chat.streamingMessageId
                  ? message.content.slice(0, chat.streamingLength || 1)
                  : message.content;

              return (
                <div
                  key={message.id}
                  className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`min-w-0 max-w-[92%] rounded-2xl px-4 py-3 sm:max-w-[78%] ${
                      isAssistant
                        ? "border border-border/70 bg-card text-foreground shadow-sm"
                        : "bg-primary text-primary-foreground shadow-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words text-sm leading-6 sm:leading-7">{content}</p>
                    {isAssistant && message.trace ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {message.trace.engine ? (
                          <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                            <Sparkles className="h-3 w-3 text-primary" />
                            {getTraceStatusLabel(message.trace.engine)}
                          </span>
                        ) : null}
                        {message.trace.fallbackUsed ? (
                          <span className="inline-flex rounded-full border border-warning/20 bg-warning-soft px-2.5 py-1 text-xs font-semibold text-foreground">
                            বিকল্প পথে উত্তর
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}

            {chat.loading ? (
              <div className="flex justify-start">
                <div className="max-w-[92%] rounded-2xl border border-border/70 bg-card px-4 py-3 text-foreground shadow-sm sm:max-w-[78%]">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <div className="space-y-1">
                      <div className="text-sm">{getThinkingLabel(chat.pendingAction, chat.responseMode)}</div>
                      <div className="text-xs text-muted-foreground">
                        {chat.loadingStages[Math.min(chat.loadingStageIndex, chat.loadingStages.length - 1)]}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {chat.pendingAction ? (
              <ActionDraftCard
                pendingAction={chat.pendingAction}
                confirmingAction={chat.confirmingAction}
                onConfirm={chat.confirmAction}
                onCancel={chat.cancelDraft}
                onEdit={chat.setPendingAction}
              />
            ) : null}

            {chat.messages.length > 0 &&
            chat.latestAssistantMessage?.trace?.engine === "action-clarification" &&
            (chat.currentClarificationChoices.length > 0 || chat.suggestions.length > 0) &&
            !chat.pendingAction ? (
              <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Exact option বেছে নিন</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      একাধিক match থাকলে নিচের card থেকে exact item select করুন।
                    </div>
                  </div>
                  {chat.currentClarificationChoices.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => chat.setShowChoiceCompareModal(true)}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-border/70 bg-background px-3 text-xs font-semibold text-foreground transition hover:border-primary/20 hover:text-primary"
                    >
                      Compare all
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                {chat.currentClarificationChoices.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {chat.currentClarificationChoices.slice(0, 4).map((choice) => (
                      <div
                        key={choice.prompt}
                        className="rounded-xl border border-border/70 bg-background p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-foreground">{choice.title}</div>
                            {choice.subtitle ? (
                              <div className="mt-1 text-xs text-muted-foreground">{choice.subtitle}</div>
                            ) : null}
                          </div>
                          {choice.badge ? (
                            <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                              {choice.badge}
                            </span>
                          ) : null}
                        </div>
                        {choice.details && choice.details.length > 0 ? (
                          <div className="mt-3 grid gap-2">
                            {choice.details.slice(0, 3).map((detail) => (
                              <div
                                key={`${choice.prompt}-${detail.label}`}
                                className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card px-3 py-2 text-xs"
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
                            chat.setQuestion(choice.prompt);
                            chat.setShowChoiceCompareModal(false);
                            void chat.askCopilot(choice.prompt);
                          }}
                          className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl border border-primary/20 bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-95"
                        >
                          এই option নিন
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {chat.suggestions.slice(0, 4).map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => {
                          chat.setQuestion(suggestion);
                          void chat.askCopilot(suggestion);
                        }}
                        className="rounded-xl border border-border/70 bg-background px-4 py-3 text-left text-sm font-medium text-foreground transition hover:border-primary/20 hover:text-primary"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {chat.messages.length > 0 &&
            chat.followUpSuggestions.length > 0 &&
            !chat.pendingAction &&
            (chat.draftCancelled || chat.latestAssistantMessage?.trace?.engine !== "action-draft") ? (
              <div className="flex flex-wrap gap-2">
                {chat.followUpSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => {
                      chat.setQuestion(suggestion);
                      void chat.askCopilot(suggestion);
                    }}
                    className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/20 hover:text-primary"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Input area */}
      <CopilotInput
        question={chat.question}
        loading={chat.loading}
        online={online}
        listening={chat.listening}
        voiceDraft={chat.voiceDraft}
        voiceAttemptLabel={chat.voiceAttemptLabel}
        messages={chat.messages}
        openSuggestionGroup={chat.openSuggestionGroup}
        showSuggestionDrawer={chat.showSuggestionDrawer}
        onQuestionChange={chat.setQuestion}
        onSend={() => void chat.askCopilot()}
        onMicToggle={chat.listening ? chat.stopListening : chat.startListening}
        onStopListening={chat.stopListening}
        onSelectSuggestion={(text) => {
          chat.setQuestion(text);
          void chat.askCopilot(text);
        }}
        onOpenSuggestionGroupChange={chat.setOpenSuggestionGroup}
        onShowSuggestionDrawerChange={chat.setShowSuggestionDrawer}
        onScrollChatToBottom={chat.scrollChatToBottom}
        textareaRef={chat.textareaRef}
      />

      {/* Compare choices modal */}
      {chat.showChoiceCompareModal && chat.currentClarificationChoices.length > 0 ? (
        <CompareChoicesModal
          choices={chat.currentClarificationChoices}
          onSelect={(prompt) => {
            chat.setQuestion(prompt);
            chat.setShowChoiceCompareModal(false);
            void chat.askCopilot(prompt);
          }}
          onClose={() => chat.setShowChoiceCompareModal(false)}
        />
      ) : null}
    </section>
  );
}
