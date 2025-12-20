"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { db } from "@/lib/dexie/db";
import { CashDeleteButton } from "./CashDeleteButton";

type CashEntry = {
  id: string;
  entryType: "IN" | "OUT";
  amount: string | number;
  reason?: string | null;
  createdAt?: string | number | Date;
};

type Props = {
  shopId: string;
  rows: CashEntry[];
};

export function CashListClient({ shopId, rows }: Props) {
  const online = useOnlineStatus();
  const [items, setItems] = useState<CashEntry[]>(rows);

  useEffect(() => {
    if (online) {
      setItems(rows);
      const mapped = rows.map((e) => ({
        id: e.id,
        shopId,
        entryType: e.entryType || "IN",
        amount: (e.amount as any)?.toString?.() ?? "0",
        reason: e.reason || "",
        createdAt: e.createdAt ? new Date(e.createdAt as any).getTime() : Date.now(),
        syncStatus: "synced" as const,
      }));
      db.cash.bulkPut(mapped as any).catch((err) => console.error("Seed Dexie cash failed", err));
      try {
        localStorage.setItem(`cachedCash:${shopId}`, JSON.stringify(rows));
      } catch {
        // ignore
      }
      return;
    }

    db.cash
      .where("shopId")
      .equals(shopId)
      .toArray()
      .then((entries) => {
        if (!entries || entries.length === 0) {
          try {
            const cached = localStorage.getItem(`cachedCash:${shopId}`);
            if (cached) setItems(JSON.parse(cached) as CashEntry[]);
          } catch {
            // ignore
          }
          return;
        }
        setItems(
          entries.map((e) => ({
            id: e.id,
            entryType: e.entryType,
            amount: e.amount,
            reason: e.reason,
            createdAt: e.createdAt,
          }))
        );
      })
      .catch((err) => console.error("Load offline cash failed", err));
  }, [online, rows, shopId]);

  const rendered = useMemo(() => items, [items]);

  if (rendered.length === 0) {
    return (
      <p className="text-center text-gray-600 py-8 bg-white border border-slate-200 rounded-xl">
        {online ? "এখনো কোনো এন্ট্রি নেই।" : "Offline: ক্যাশ এন্ট্রি ক্যাশে নেই"}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {rendered.map((e) => {
        const amt = Number(e.amount ?? 0);
        const val = Number.isFinite(amt) ? amt.toFixed(2) : (e.amount as any)?.toString?.() ?? "0";
        const created = e.createdAt ? new Date(e.createdAt as any) : null;
        const dateStr = created ? created.toISOString().slice(0, 10) : "";
        const inFlow = e.entryType === "IN";
        return (
          <div
            key={e.id}
            className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-4 md:flex-row md:justify-between md:items-center shadow-sm hover:shadow-md card-lift"
          >
            <div>
              <p className={`text-2xl font-bold ${inFlow ? "text-emerald-700" : "text-red-600"}`}>
                {inFlow ? "+" : "-"}
                {val} ৳
              </p>
              <p className="text-base text-gray-700 mt-2">{e.reason || "—"}</p>
              {dateStr ? <p className="text-sm text-gray-500 mt-1">তারিখ: {dateStr}</p> : null}
            </div>

            <div className="w-full md:w-auto grid grid-cols-2 gap-2 md:flex md:gap-2">
              {online ? (
                <Link
                  href={`/dashboard/cash/${e.id}`}
                  className="w-full md:w-auto px-4 py-2 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg font-semibold hover:border-blue-300 hover:bg-blue-100 transition-colors text-center"
                >
                  এডিট
                </Link>
              ) : (
                <span className="text-xs text-slate-400 text-center px-3">
                  Offline: এডিট সম্ভব নয়
                </span>
              )}
              <CashDeleteButton id={e.id} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
