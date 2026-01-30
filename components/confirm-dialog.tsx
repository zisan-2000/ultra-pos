"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "নিশ্চিত",
  cancelLabel = "বাতিল",
  onConfirm,
  onOpenChange,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end pt-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-10 px-4 rounded-xl border border-border bg-card text-foreground text-sm font-semibold hover:bg-muted"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-10 px-4 rounded-xl bg-danger text-primary-foreground text-sm font-semibold hover:bg-danger/90"
          >
            {confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
