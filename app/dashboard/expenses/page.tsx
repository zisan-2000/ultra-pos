// app/dashboard/expenses/page.tsx

import Link from "next/link";
import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import {
  getExpenseSummaryByRange,
  getExpensesByShopCursorPaginated,
} from "@/app/actions/expenses";

import ShopSelectorClient from "./ShopSelectorClient";
import { ExpensesListClient } from "./components/ExpensesListClient";

import {
  buildCursorPageLink,
  decodeCursorList,
  encodeCursorList,
  normalizeCursorPageState,
  toCursorInput,
} from "@/lib/cursor-pagination";

type ExpensePageProps = {
  searchParams?: Promise<{
    shopId?: string;
    from?: string;
    to?: string;
    page?: string;
    cursors?: string;
    cursorBase?: string;
  }>;
};

const PAGE_SIZE = 20;
const MAX_CURSOR_HISTORY = 20;

function parsePositiveInt(value?: string) {
  if (!value) return null;
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function ExpensesPage({
  searchParams,
}: ExpensePageProps) {
  const shops = await getShopsByUser();
  const resolvedSearch = await searchParams;

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">খরচের তালিকা</h1>
        <p className="mb-6 text-muted-foreground">এখনও কোনো দোকান নেই।</p>
        <Link
          href="/dashboard/shops/new"
          className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors"
        >
          প্রথম দোকান তৈরি করুন
        </Link>
      </div>
    );
  }

  const cookieStore = await cookies();
  const cookieShopId = cookieStore.get("activeShopId")?.value;

  const cookieSelectedShopId =
    cookieShopId && shops.some((s) => s.id === cookieShopId)
      ? cookieShopId
      : null;

  const selectedShopId =
    resolvedSearch?.shopId &&
    shops.some((s) => s.id === resolvedSearch.shopId)
      ? resolvedSearch.shopId
      : cookieSelectedShopId ?? shops[0].id;

  const selectedShop = shops.find((s) => s.id === selectedShopId)!;

  const rawFrom = resolvedSearch?.from;
  const rawTo = resolvedSearch?.to;
  const from = rawFrom ?? rawTo ?? todayStr();
  const to = rawTo ?? from;

  const pageParam = parsePositiveInt(resolvedSearch?.page) ?? 1;
  const cursorBaseParam = parsePositiveInt(resolvedSearch?.cursorBase) ?? 2;
  const cursorList = decodeCursorList(resolvedSearch?.cursors);

  const normalized = normalizeCursorPageState({
    page: pageParam,
    cursors: cursorList,
    cursorBase: cursorBaseParam,
    maxHistory: MAX_CURSOR_HISTORY,
  });

  const [{ items: serializableRows, nextCursor, hasMore }, summary] =
    await Promise.all([
      getExpensesByShopCursorPaginated({
        shopId: selectedShopId,
        limit: PAGE_SIZE,
        cursor: toCursorInput(normalized.currentCursor),
        from,
        to,
      }),
      getExpenseSummaryByRange(selectedShopId, from, to),
    ]);

  const buildHref = ({
    page,
    cursors,
    cursorBase,
  }: {
    page?: number;
    cursors?: { createdAt: string; id: string }[];
    cursorBase?: number;
  }) => {
    const params = new URLSearchParams();
    params.set("shopId", selectedShopId);
    params.set("from", from);
    params.set("to", to);
    if (page && page > 1) {
      params.set("page", `${page}`);
      if (cursorBase) params.set("cursorBase", `${cursorBase}`);
      if (cursors && cursors.length > 0) {
        params.set("cursors", encodeCursorList(cursors));
      }
    }
    return `/dashboard/expenses?${params.toString()}`;
  };

  const prevHref =
    normalized.page > 1
      ? buildCursorPageLink({
          targetPage: normalized.page - 1,
          currentPage: normalized.page,
          cursors: normalized.cursors,
          cursorBase: normalized.cursorBase,
          nextCursor,
          maxHistory: MAX_CURSOR_HISTORY,
          buildHref,
        })
      : null;

  const nextHref = hasMore
    ? buildCursorPageLink({
        targetPage: normalized.page + 1,
        currentPage: normalized.page,
        cursors: normalized.cursors,
        cursorBase: normalized.cursorBase,
        nextCursor,
        maxHistory: MAX_CURSOR_HISTORY,
        buildHref,
      })
    : null;

  return (
    <div className="space-y-4 section-gap">
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-warning-soft text-warning">
              💸
            </span>
            <div>
              <h1 className="text-2xl font-bold text-foreground leading-tight">
                খরচ
              </h1>
              <p className="text-sm text-muted-foreground leading-snug">
                দোকান: <span className="font-semibold text-foreground">{selectedShop.name}</span>
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-snug">
            আজ কত খরচ হলো, দ্রুত দেখুন ও নিয়ন্ত্রণ করুন।
          </p>
        </div>

        <div className="w-full lg:w-auto flex flex-col sm:flex-row sm:items-center gap-3">
          <ShopSelectorClient shops={shops} selectedShopId={selectedShopId} />

          <Link
            href={`/dashboard/expenses/new?shopId=${selectedShopId}`}
            className="w-full sm:w-auto px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-semibold hover:bg-primary/15 hover:border-primary/40 transition-colors text-center pressable"
          >
            + নতুন খরচ
          </Link>
        </div>
      </div>

      <ExpensesListClient
        shopId={selectedShopId}
        expenses={serializableRows}
        from={from}
        to={to}
        page={normalized.page}
        prevHref={prevHref}
        nextHref={nextHref}
        hasMore={Boolean(hasMore)}
        summaryTotal={summary.totalAmount}
        summaryCount={summary.count}
      />
    </div>
  );
}


