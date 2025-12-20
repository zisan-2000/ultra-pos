"use client";

import { useOnlineStatus } from "@/lib/sync/net-status";
import { db } from "@/lib/dexie/db";
import { queueAdd } from "@/lib/sync/queue";

type Props = {
  id: string;
};

export function CashDeleteButton({ id }: Props) {
  const online = useOnlineStatus();

  const handleDelete = async () => {
    const confirmDelete = confirm("ক্যাশ এন্ট্রি ডিলিট করবেন?");
    if (!confirmDelete) return;

    await db.cash.delete(id);
    await queueAdd("cash", "delete", { id });
    alert("ডিলিট কিউ হয়েছে, সংযোগ পেলে সিঙ্ক হবে।");
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      className="w-full md:w-auto px-4 py-2 bg-red-50 border border-red-200 text-red-800 rounded-lg font-semibold hover:border-red-300 hover:bg-red-100 transition-colors"
    >
      ডিলিট
    </button>
  );
}
