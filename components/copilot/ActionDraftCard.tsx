import type { OwnerCopilotActionDraft } from "@/lib/owner-copilot-actions";
import { getDraftFieldInfo, getConfirmButtonLabel } from "./copilot-chat-types";

export function ActionDraftCard({
  pendingAction,
  confirmingAction,
  onConfirm,
  onCancel,
  onEdit,
}: {
  pendingAction: OwnerCopilotActionDraft;
  confirmingAction: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onEdit: (draft: OwnerCopilotActionDraft) => void;
}) {
  const info = getDraftFieldInfo(pendingAction);

  const handleFieldChange = (field: string, value: string) => {
    onEdit({ ...pendingAction, [field]: value } as OwnerCopilotActionDraft);
  };

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary-soft p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">Review ও edit করুন</div>
        <span className="inline-flex rounded-full border border-primary/20 bg-card px-2.5 py-1 text-xs font-semibold text-primary">
          {info.actionLabel}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {/* Read-only fields */}
        {info.readOnlyFields.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-border/70 bg-card px-3 py-3 text-sm text-foreground"
          >
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {item.label}
            </div>
            <div className="mt-1 font-semibold">{item.value}</div>
          </div>
        ))}

        {/* Editable fields */}
        {info.editableFields.map((ef) => {
          const currentValue = String(
            (pendingAction as Record<string, unknown>)[ef.field] ?? ""
          );
          return (
            <div
              key={ef.field}
              className="rounded-lg border border-border/70 bg-card px-3 py-2 text-sm text-foreground"
            >
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {ef.label}
              </label>
              <input
                type="text"
                inputMode={ef.type === "number" ? "decimal" : "text"}
                value={currentValue}
                onChange={(e) => handleFieldChange(ef.field, e.target.value)}
                disabled={confirmingAction}
                className="mt-1 block w-full rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-sm font-semibold text-foreground outline-none transition focus:border-primary/40 focus:ring-1 focus:ring-primary/20 disabled:opacity-60"
              />
            </div>
          );
        })}
      </div>

      <div className="mt-3 rounded-lg border border-border/70 bg-card px-3 py-3 text-sm text-foreground">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Summary
        </div>
        <div className="mt-1">{pendingAction.summary}</div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmingAction}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-primary/20 bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {getConfirmButtonLabel(pendingAction, confirmingAction)}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={confirmingAction}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-border/70 bg-card px-4 text-sm font-semibold text-foreground transition hover:border-primary/20 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
