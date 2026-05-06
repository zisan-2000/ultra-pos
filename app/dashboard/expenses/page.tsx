// app/dashboard/expenses/page.tsx

import Link from "next/link";
import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import {
  getExpenseSummaryByRange,
  getExpensesByShopCursorPaginated,
} from "@/app/actions/expenses";
import { getDhakaDateString } from "@/lib/dhaka-date";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";

import ShopSelectorClient from "./ShopSelectorClient";
import { ExpensesListClient } from "./components/ExpensesListClient";
import QuickExpenseSheet from "./components/QuickExpenseSheet";

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

export default async function ExpensesPage({
  searchParams,
}: ExpensePageProps) {
  const [user, shops, resolvedSearch] = await Promise.all([
    requireUser(),
    getShopsByUser(),
    searchParams,
  ]);
  const canViewExpenses = hasPermission(user, "view_expenses");
  const canCreateExpense = hasPermission(user, "create_expense");
  const canUpdateExpense = hasPermission(user, "update_expense");
  const canDeleteExpense = hasPermission(user, "delete_expense");

  if (!canViewExpenses) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">খরচ তালিকা</h1>
        <p className="mb-2 text-danger font-semibold">অ্যাকসেস সীমাবদ্ধ</p>
        <p className="mb-6 text-muted-foreground">
          এই পেজ ব্যবহারের জন্য <code>view_expenses</code> permission লাগবে।
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors"
        >
          ড্যাশবোর্ডে ফিরুন
        </Link>
      </div>
    );
  }

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">খরচ তালিকা</h1>
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
  const today = getDhakaDateString();
  const from = rawFrom ?? rawTo ?? today;
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
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-warning-soft/50 via-card to-card" />
        <div className="pointer-events-none absolute -top-12 right-0 h-32 w-32 rounded-full bg-warning/20 blur-3xl" />
        <div className="relative space-y-3 p-4">

          {/* Title row */}
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                খরচ
              </p>
              <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl">
                খরচ তালিকা
              </h1>
            </div>
            {canCreateExpense ? (
              <QuickExpenseSheet
                shopId={selectedShopId}
                fullFormHref={`/dashboard/expenses/new?shopId=${selectedShopId}`}
                triggerLabel="+ নতুন খরচ"
                triggerClassName="inline-flex h-9 shrink-0 items-center rounded-full bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold shadow-sm hover:bg-primary/15 hover:border-primary/40 transition-colors"
              />
            ) : null}
          </div>

          {/* Shop selector */}
          <ShopSelectorClient shops={shops} selectedShopId={selectedShopId} />

          {/* Stats chips */}
          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3 text-xs">
            <span className="inline-flex h-7 items-center rounded-full border border-danger/30 bg-danger-soft px-3 font-semibold text-danger">
              ৳{" "}
              {totalAmount.toLocaleString("bn-BD", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="inline-flex h-7 items-center rounded-full border border-border bg-card/80 px-3 font-semibold text-muted-foreground">
              {summary.count ?? 0} এন্ট্রি
            </span>
            <span className="inline-flex h-7 max-w-45 items-center truncate rounded-full border border-border bg-card/80 px-3 font-semibold text-muted-foreground">
              {rangeLabel}
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
        canCreateExpense={canCreateExpense}
        canUpdateExpense={canUpdateExpense}
        canDeleteExpense={canDeleteExpense}
      />
    </div>
  );
}
