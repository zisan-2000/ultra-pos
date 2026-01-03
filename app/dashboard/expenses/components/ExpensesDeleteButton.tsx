"use client";

import { useOnlineStatus } from "@/lib/sync/net-status";
import { db } from "@/lib/dexie/db";
import { queueAdd } from "@/lib/sync/queue";

type Props = {
  id: string;
};

export function ExpensesDeleteButton({ id }: Props) {
  const online = useOnlineStatus();

  const handleDelete = async () => {
    const confirmDelete = confirm("খরচ ডিলিট করতে চান?");
    if (!confirmDelete) return;

    if (online) {
      await db.expenses.delete(id);
      await queueAdd("expense", "delete", { id });
    }

    alert("ডিলিট কিউ হয়েছে, সংযোগ পেলে সিঙ্ক হবে।");
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      className="w-full md:w-auto px-4 py-2 bg-danger-soft border border-danger/30 text-danger rounded-lg font-semibold hover:border-danger/50 hover:bg-danger-soft/70 transition-colors"
    >
      ডিলিট
    </button>
  );
}
