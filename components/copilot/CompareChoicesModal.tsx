import { ChevronRight, X } from "lucide-react";
import type { ClarificationChoice } from "./copilot-chat-types";

export function CompareChoicesModal({
  choices,
  onSelect,
  onClose,
}: {
  choices: readonly ClarificationChoice[];
  onSelect: (prompt: string) => void;
  onClose: () => void;
}) {
  if (choices.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-3xl border border-border/70 bg-background shadow-lg">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
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
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground transition hover:border-primary/20 hover:text-primary"
            aria-label="Close compare modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(90vh-88px)] overflow-y-auto p-5">
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {choices.map((choice) => (
              <div
                key={choice.prompt}
                className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-bold text-foreground">{choice.title}</div>
                    {choice.subtitle ? (
                      <div className="mt-1 text-sm text-muted-foreground">{choice.subtitle}</div>
                    ) : null}
                  </div>
                  {choice.badge ? (
                    <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                      {choice.badge}
                    </span>
                  ) : null}
                </div>
                {choice.details && choice.details.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {choice.details.map((detail) => (
                      <div
                        key={`${choice.prompt}-${detail.label}`}
                        className="rounded-lg border border-border/70 bg-background px-3 py-3"
                      >
                        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
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
                  onClick={() => onSelect(choice.prompt)}
                  className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-95"
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
  );
}
