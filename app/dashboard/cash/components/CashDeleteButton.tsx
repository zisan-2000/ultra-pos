"use client";

import { useOnlineStatus } from "@/lib/sync/net-status";
import { db } from "@/lib/dexie/db";
import { queueAdd } from "@/lib/sync/queue";
import { handlePermissionError } from "@/lib/permission-toast";
import { cn } from "@/lib/utils";
import { useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";

type Props = {
  id: string;
  onDeleted: (id: string) => void;
  className?: string;
};

export function CashDeleteButton({ id, onDeleted, className }: Props) {
  const online = useOnlineStatus();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDelete = async () => {
    onDeleted(id);

    try {
      await db.transaction("rw", db.cash, db.queue, async () => {
        const existing = await db.cash.get(id);
        const now = Date.now();
        if (existing) {
          await db.cash.update(id, {
            syncStatus: "deleted",
            deletedAt: now,
            updatedAt: now,
            conflictAction: undefined,
          });
        }
        await queueAdd("cash", "delete", { id, updatedAt: existing?.updatedAt });
      });
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
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className={cn(
          "inline-flex h-9 items-center justify-center rounded-full bg-danger-soft border border-danger/30 px-3 text-xs font-semibold text-danger hover:border-danger/50 hover:bg-danger-soft/70 transition-colors",
          className
        )}
      >
        মুছুন
      </button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="ক্যাশ এন্ট্রি মুছে ফেলবেন?"
        description="এই এন্ট্রি মুছে দিলে আর ফেরত আনা যাবে না।"
        confirmLabel="মুছুন"
        onConfirm={() => {
          setConfirmOpen(false);
          handleDelete();
        }}
      />
    </>
  );
}
