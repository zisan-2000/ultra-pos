"use client";

import { useOnlineStatus } from "@/lib/sync/net-status";
import { db } from "@/lib/dexie/db";
import { queueAdd } from "@/lib/sync/queue";
import { handlePermissionError } from "@/lib/permission-toast";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  onDeleted: (id: string) => void;
  className?: string;
};

export function CashDeleteButton({ id, onDeleted, className }: Props) {
  const online = useOnlineStatus();

  const handleDelete = async () => {
    const confirmDelete = confirm("আপনি কি ক্যাশ এন্ট্রিটি মুছে ফেলতে চান?");
    if (!confirmDelete) return;

    onDeleted(id);

    try {
      await db.cash.delete(id);
      await queueAdd("cash", "delete", { id });
    } catch (err) {
      handlePermissionError(err);
      console.error("Cash delete failed", err);
    }

    alert(
      online
        ? "ক্যাশ এন্ট্রি মুছে ফেলা হয়েছে, সিঙ্ক হবে।"
        : "অফলাইন: ক্যাশ এন্ট্রি মুছে ফেলা হয়েছে, অনলাইনে গেলে সিঙ্ক হবে।"
    );
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-full bg-danger-soft border border-danger/30 px-3 text-xs font-semibold text-danger hover:border-danger/50 hover:bg-danger-soft/70 transition-colors",
        className
      )}
    >
      মুছুন
    </button>
  );
}
