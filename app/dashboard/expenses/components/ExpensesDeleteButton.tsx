"use client";

import { useOnlineStatus } from "@/lib/sync/net-status";
import { db } from "@/lib/dexie/db";
import { queueAdd, queueRemoveExpenseById } from "@/lib/sync/queue";
import { handlePermissionError } from "@/lib/permission-toast";
import { useRealtimeStatus } from "@/lib/realtime/status";
import useRealTimeReports from "@/hooks/useRealTimeReports";
import { emitExpenseUpdate } from "@/lib/events/reportEvents";

type Props = {
  id: string;
  shopId: string;
  amount?: number;
  syncStatus?: "new" | "updated" | "deleted" | "synced";
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

  const handleDelete = async () => {
    const confirmDelete = confirm("আপনি কি খরচটি মুছে ফেলতে চান?");
    if (!confirmDelete) return;

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
        await db.expenses.delete(id);
        if (isLocalOnly) {
          await queueRemoveExpenseById(id);
        } else {
          await queueAdd("expense", "delete", { id, shopId });
        }
      }
    } catch (err) {
      handlePermissionError(err);
      console.error("Expense delete failed", err);
      if (updateId) {
        realTimeReports.rollbackLastUpdate();
      }
      alert("খরচ মুছে ফেলা যায়নি, আবার চেষ্টা করুন।");
      return;
    }

    alert(
      online
        ? "খরচটি মুছে ফেলা হয়েছে, সিঙ্ক হবে।"
        : "অফলাইন: খরচটি মুছে ফেলা হয়েছে, অনলাইনে গেলে সিঙ্ক হবে।"
    );
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      className={`inline-flex items-center justify-center gap-2 w-full px-4 py-2 bg-danger-soft border border-danger/30 text-danger rounded-lg font-semibold hover:border-danger/50 hover:bg-danger-soft/70 transition-colors ${className || ""}`}
    >
      🗑️ মুছুন
    </button>
  );
}
