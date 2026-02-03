"use client";

import { useOnlineStatus } from "@/lib/sync/net-status";
import { db } from "@/lib/dexie/db";
import { queueAdd, queueRemoveExpenseById } from "@/lib/sync/queue";
import { handlePermissionError } from "@/lib/permission-toast";
import { useRealtimeStatus } from "@/lib/realtime/status";
import useRealTimeReports from "@/hooks/useRealTimeReports";
import { emitExpenseUpdate } from "@/lib/events/reportEvents";
import { useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import { toast } from "sonner";

type Props = {
  id: string;
  shopId: string;
  amount?: number;
  syncStatus?: "new" | "updated" | "deleted" | "synced" | "conflict";
  onDeleted: (id: string) => void;
  className?: string;
};

export function ExpensesDeleteButton({
  id,
  shopId,
  amount,
  syncStatus,
  onDeleted,
  className,
}: Props) {
  const online = useOnlineStatus();
  const realtime = useRealtimeStatus();
  const realTimeReports = useRealTimeReports(shopId);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDelete = async () => {
    onDeleted(id);

    let updateId: string | undefined;

    try {
      const shouldOptimisticallyUpdate = !online || !realtime.connected;
      const amountNum = Number(amount ?? 0);

      if (shouldOptimisticallyUpdate && Number.isFinite(amountNum) && amountNum > 0) {
        updateId = realTimeReports.updateExpenseReport(amountNum, "subtract", {
          expenseId: id,
          timestamp: Date.now(),
        });
        emitExpenseUpdate(
          shopId,
          {
            type: "expense",
            operation: "subtract",
            amount: amountNum,
            shopId,
            metadata: {
              expenseId: id,
              timestamp: Date.now(),
            },
          },
          { source: "ui", priority: "high", correlationId: updateId }
        );
      }

      const isLocalOnly = syncStatus === "new";

      if (online && !isLocalOnly) {
        const res = await fetch("/api/sync/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deletedIds: [id] }),
        });
        if (!res.ok) {
          throw new Error("Expense delete failed");
        }
        await db.expenses.delete(id);
        await queueRemoveExpenseById(id);
        if (updateId) {
          setTimeout(() => {
            realTimeReports.syncWithServer(updateId);
          }, 400);
        }
      } else {
        await db.transaction("rw", db.expenses, db.queue, async () => {
          if (isLocalOnly) {
            await db.expenses.delete(id);
            await queueRemoveExpenseById(id);
          } else {
            const existing = await db.expenses.get(id);
            const now = Date.now();
            if (existing) {
              await db.expenses.update(id, {
                syncStatus: "deleted",
                deletedAt: now,
                updatedAt: now,
                conflictAction: undefined,
              });
            }
            await queueAdd("expense", "delete", {
              id,
              shopId,
              updatedAt: existing?.updatedAt,
            });
          }
        });
      }
    } catch (err) {
      handlePermissionError(err);
      console.error("Expense delete failed", err);
      if (updateId) {
        realTimeReports.rollbackLastUpdate();
      }
      toast.error("খরচ মুছে ফেলা যায়নি, আবার চেষ্টা করুন।");
      return;
    }

    toast.warning(
      online
        ? "খরচটি মুছে ফেলা হয়েছে"
        : "অফলাইন: খরচটি মুছে ফেলা হয়েছে, অনলাইনে গেলে সিঙ্ক হবে।"
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className={`inline-flex items-center justify-center gap-2 w-full px-4 py-2 bg-danger-soft border border-danger/30 text-danger rounded-lg font-semibold hover:border-danger/50 hover:bg-danger-soft/70 transition-colors ${className || ""}`}
      >
        🗑️ মুছুন
      </button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="খরচ মুছে ফেলবেন?"
        description="এই খরচটি মুছে দিলে আর ফেরত আনা যাবে না।"
        confirmLabel="মুছুন"
        onConfirm={() => {
          setConfirmOpen(false);
          handleDelete();
        }}
      />
    </>
  );
}
