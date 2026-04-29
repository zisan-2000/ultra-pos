import { ChevronRight } from "lucide-react";
import { COPILOT_GROUPED_QUESTION_SUGGESTIONS } from "@/lib/copilot-ask";

export function SuggestionAccordion({
  openGroup,
  onOpenGroupChange,
  onSelectSuggestion,
}: {
  openGroup: string | null;
  onOpenGroupChange: (value: string | null) => void;
  onSelectSuggestion: (text: string) => void;
}) {
  return (
    <div className="w-full rounded-3xl border border-border/70 bg-card p-4 text-left shadow-sm">
      <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        আরও প্রশ্নের ধরন
      </div>
      <div className="space-y-2">
        {COPILOT_GROUPED_QUESTION_SUGGESTIONS.map((group) => {
          const isOpen = openGroup === group.label;
          return (
            <div key={group.label} className="rounded-xl border border-border/70 bg-background">
              <button
                type="button"
                onClick={() =>
                  onOpenGroupChange(openGroup === group.label ? null : group.label)
                }
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
              >
                <div>
                  <div className="text-sm font-semibold text-foreground">{group.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {group.questions.length}টি example question
                  </div>
                </div>
                <ChevronRight
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    isOpen ? "rotate-90" : ""
                  }`}
                />
              </button>
              {isOpen ? (
                <div className="flex flex-wrap gap-2 border-t border-border/70 px-3 py-3">
                  {group.questions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => onSelectSuggestion(suggestion)}
                      className="max-w-full rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/20 hover:text-primary"
                    >
                      <span className="block max-w-full truncate sm:whitespace-normal">{suggestion}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
