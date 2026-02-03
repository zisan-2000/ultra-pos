"use client";

import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { db } from "@/lib/dexie/db";

export type ConflictCounts = {
  products: number;
  expenses: number;
  cash: number;
  total: number;
};

const EMPTY_COUNTS: ConflictCounts = {
  products: 0,
  expenses: 0,
  cash: 0,
  total: 0,
};

export function useConflictCounts() {
  const [counts, setCounts] = useState<ConflictCounts>(EMPTY_COUNTS);

  useEffect(() => {
    const sub = liveQuery(async () => {
      const [products, expenses, cash] = await Promise.all([
        db.products.where("syncStatus").equals("conflict").count(),
        db.expenses.where("syncStatus").equals("conflict").count(),
        db.cash.where("syncStatus").equals("conflict").count(),
      ]);
      return {
        products,
        expenses,
        cash,
        total: products + expenses + cash,
      };
    }).subscribe({
      next: (next) => setCounts(next),
      error: () => setCounts(EMPTY_COUNTS),
    });

    return () => sub.unsubscribe();
  }, []);

  return counts;
}
