import type { RefObject } from "react";
import {
  ChevronRight,
  Loader2,
  Mic,
  SendHorizonal,
  Waves,
  X,
} from "lucide-react";
import { SuggestionAccordion } from "./SuggestionAccordion";

export function CopilotInput({
  question,
  loading,
  online,
  listening,
  voiceDraft,
  voiceAttemptLabel,
  messages,
  openSuggestionGroup,
  showSuggestionDrawer,
  onQuestionChange,
  onSend,
  onMicToggle,
  onStopListening,
  onSelectSuggestion,
  onOpenSuggestionGroupChange,
  onShowSuggestionDrawerChange,
  onScrollChatToBottom,
  textareaRef,
}: {
  question: string;
  loading: boolean;
  online: boolean;
  listening: boolean;
  voiceDraft: string;
  voiceAttemptLabel: string | null;
  messages: readonly { id: string }[];
  openSuggestionGroup: string | null;
  showSuggestionDrawer: boolean;
  onQuestionChange: (value: string) => void;
  onSend: () => void;
  onMicToggle: () => void;
  onStopListening: () => void;
  onSelectSuggestion: (text: string) => void;
  onOpenSuggestionGroupChange: (value: string | null) => void;
  onShowSuggestionDrawerChange: (value: boolean) => void;
  onScrollChatToBottom: (behavior?: ScrollBehavior) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const hasMessages = messages.length > 0;

  return (
    <div className="border-t border-border bg-background px-3 py-2 sm:px-5 sm:py-3">
      <div className="mx-auto max-w-4xl space-y-2">
        {(listening || voiceDraft) && online ? (
          <div className="rounded-xl border border-primary/20 bg-primary-soft p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/20 bg-card text-primary">
                  <Waves className={`h-4 w-4 ${listening ? "animate-pulse" : ""}`} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {listening ? "Voice capture চলছে" : "শেষ transcript ধরা হয়েছে"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {voiceAttemptLabel || "Bangla first, English fallback"}
                  </div>
                </div>
              </div>
              {listening ? (
                <button
                  type="button"
                  onClick={onStopListening}
                  className="inline-flex h-8 items-center justify-center rounded-full border border-border/70 bg-card px-3 text-xs font-semibold text-foreground transition hover:border-primary/20 hover:text-primary"
                >
                  Stop
                </button>
              ) : null}
            </div>
            <div className="mt-2 rounded-lg border border-border/70 bg-card px-3 py-2 text-sm leading-7 text-foreground">
              {voiceDraft || "শুনছি..."}
            </div>
          </div>
        ) : null}

        <div className="rounded-3xl border border-border/70 bg-card shadow-sm">
          <div className="flex items-end gap-2 px-3 py-2 sm:px-3 sm:py-2.5">
            <textarea
              ref={textareaRef}
              value={question}
              onChange={(event) => onQuestionChange(event.target.value)}
              onFocus={() => {
                window.setTimeout(() => {
                  onScrollChatToBottom("smooth");
                  textareaRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                  });
                }, 140);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  onSend();
                }
              }}
              placeholder="আজ দোকান কেমন চলছে? / কোন product-এর stock কত?"
              rows={1}
              className="max-h-28 min-h-[38px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground sm:max-h-36 sm:min-h-[42px]"
            />
            <div className="flex shrink-0 items-center gap-1.5 pb-0.5 sm:gap-2 sm:pb-1">
              <button
                type="button"
                onClick={onMicToggle}
                disabled={!online}
                aria-label={listening ? "শোনা বন্ধ করুন" : "মাইক্রোফোনে প্রশ্ন করুন"}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition sm:h-10 sm:w-10 ${
                  listening
                    ? "border-primary/20 bg-primary/10 text-primary"
                    : "border-border/70 bg-background text-muted-foreground hover:border-primary/20 hover:text-primary"
                } ${!online ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <Mic className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onSend}
                disabled={loading || !online || !question.trim()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-primary/20 bg-primary text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:w-10"
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

        {/* Explore questions — only visible when chat is empty (empty state already has accordion in chat area) */}
        {!hasMessages ? (
          <div className="relative rounded-3xl border border-border/70 bg-card shadow-sm">
            <button
              type="button"
              onClick={() => onShowSuggestionDrawerChange(!showSuggestionDrawer)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
            >
              <div>
                <div className="text-sm font-semibold text-foreground">Explore questions</div>
                <div className="text-xs text-muted-foreground">
                  grouped business question examples
                </div>
              </div>
              <ChevronRight
                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                  showSuggestionDrawer ? "rotate-90" : ""
                }`}
              />
            </button>
          </div>
        ) : null}

        {/* Floating explore drawer — only when in active chat */}
        {hasMessages ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => onShowSuggestionDrawerChange(!showSuggestionDrawer)}
              className="flex w-full items-center justify-center gap-1.5 py-1 text-xs font-medium text-muted-foreground transition hover:text-primary"
            >
              Explore questions
              <ChevronRight
                className={`h-3 w-3 transition-transform ${showSuggestionDrawer ? "rotate-90" : ""}`}
              />
            </button>
            {showSuggestionDrawer ? (
              <div className="absolute bottom-full left-0 right-0 z-20 mb-2 overflow-hidden rounded-3xl border border-border/70 bg-background shadow-md">
                <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                  <div className="text-sm font-semibold text-foreground">Explore questions</div>
                  <button
                    type="button"
                    onClick={() => onShowSuggestionDrawerChange(false)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground transition hover:border-primary/20 hover:text-primary"
                    aria-label="Explore drawer বন্ধ করুন"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="max-h-[min(46vh,380px)] overflow-y-auto px-2 py-2">
                  <SuggestionAccordion
                    openGroup={openSuggestionGroup}
                    onOpenGroupChange={onOpenSuggestionGroupChange}
                    onSelectSuggestion={(text) => {
                      onShowSuggestionDrawerChange(false);
                      onSelectSuggestion(text);
                    }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
