"use client";

import { useOnlineStatus } from "@/lib/sync/net-status";
import { db } from "@/lib/dexie/db";
import { queueAdd } from "@/lib/sync/queue";
import { handlePermissionError } from "@/lib/permission-toast";

type Props = {
  id: string;
  onDeleted: (id: string) => void;
};

export function ExpensesDeleteButton({ id, onDeleted }: Props) {
  const online = useOnlineStatus();

  const handleDelete = async () => {
    const confirmDelete = confirm("আপনি কি খরচটি মুছে ফেলতে চান?");
    if (!confirmDelete) return;

    onDeleted(id);

    try {
      await db.expenses.delete(id);
      await queueAdd("expense", "delete", { id });
    } catch (err) {
      handlePermissionError(err);
      console.error("Expense delete failed", err);
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
      className="w-full md:w-auto px-4 py-2 bg-danger-soft border border-danger/30 text-danger rounded-lg font-semibold hover:border-danger/50 hover:bg-danger-soft/70 transition-colors"
    >
      মুছুন
    </button>
  );
}
