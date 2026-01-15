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
  const totalAmount = Number(summary.totalAmount ?? 0);
  const formattedTotal = Number.isFinite(totalAmount) ? totalAmount.toFixed(2) : "0.00";
  const today = todayStr();
  const rangeLabel =
    from === to ? (from === today ? "আজ" : from) : `${from} → ${to}`;

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
    <div className="space-y-4 sm:space-y-5 section-gap">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_16px_36px_rgba(15,23,42,0.08)] animate-fade-in">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-warning-soft/60 via-card to-card" />
        <div className="pointer-events-none absolute -top-16 right-0 h-40 w-40 rounded-full bg-warning/20 blur-3xl" />
        <div className="relative space-y-3 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                খরচ
              </p>
              <h1 className="text-2xl font-bold text-foreground leading-tight tracking-tight sm:text-3xl">
                খরচ তালিকা
              </h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
                দোকান:
                <span className="truncate font-semibold text-foreground">
                  {selectedShop.name}
                </span>
              </p>
            </div>

            <Link
              href={`/dashboard/expenses/new?shopId=${selectedShopId}`}
              className="hidden sm:inline-flex h-10 items-center gap-2 rounded-full bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold shadow-sm hover:bg-primary/15 hover:border-primary/40 transition-colors"
            >
              ➕ নতুন খরচ
            </Link>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:w-auto">
              <ShopSelectorClient shops={shops} selectedShopId={selectedShopId} />
            </div>
            <Link
              href={`/dashboard/expenses/new?shopId=${selectedShopId}`}
              className="sm:hidden inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold shadow-sm hover:bg-primary/15 hover:border-primary/40 transition-colors"
            >
              ➕ নতুন খরচ যোগ করুন
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3 text-xs">
            <span className="inline-flex h-7 items-center gap-1 rounded-full bg-card/80 px-3 font-semibold text-foreground border border-border shadow-[0_1px_0_rgba(0,0,0,0.03)]">
              মোট {summary.count ?? 0} টি
            </span>
            <span className="inline-flex h-7 items-center gap-1 rounded-full bg-card/80 px-3 font-semibold text-muted-foreground border border-border">
              ৳ {formattedTotal}
            </span>
            <span className="inline-flex h-7 max-w-[200px] items-center gap-1 rounded-full bg-card/80 px-3 font-semibold text-muted-foreground border border-border truncate">
              সময়: {rangeLabel}
            </span>
          </div>
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


