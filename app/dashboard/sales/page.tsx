// app/dashboard/sales/page.tsx

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { Buffer } from "buffer";
import { getShopsByUser } from "@/app/actions/shops";
import {
  getSalesByShopPaginated,
  getSalesSummary,
  voidSale,
  type SaleCursor,
} from "@/app/actions/sales";
import { getDhakaDateString, getDhakaRangeFromDays } from "@/lib/dhaka-date";
import ShopSelectorClient from "./ShopSelectorClient";
import SalesListClient from "./components/SalesListClient";
import DateFilterClient from "./components/DateFilterClient";

type SalesSearchParams = {
  shopId?: string;
  page?: string;
  cursors?: string;
  cursorBase?: string;
  from?: string;
  to?: string;
};

type SalesPageProps = {
  searchParams?: Promise<SalesSearchParams | undefined>;
};

const PAGE_SIZE = 12;
const MAX_CURSOR_HISTORY = 20;

function parsePositiveInt(value?: string) {
  if (!value) return null;
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDateInput(value?: string) {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function parseDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function encodeCursorList(list: SaleCursor[]) {
  return Buffer.from(JSON.stringify(list), "utf8").toString("base64url");
}

function decodeCursorList(value?: string): SaleCursor[] {
  if (!value) return [];
  try {
    const raw = Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cursors: SaleCursor[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const saleDate =
        typeof (entry as { saleDate?: unknown }).saleDate === "string"
          ? (entry as { saleDate: string }).saleDate
          : typeof (entry as { createdAt?: unknown }).createdAt === "string"
          ? (entry as { createdAt: string }).createdAt
          : null;
      const id =
        typeof (entry as { id?: unknown }).id === "string"
          ? (entry as { id: string }).id
          : null;
      if (saleDate && id) {
        cursors.push({ saleDate, id });
      }
    }
    return cursors;
  } catch {
    return [];
  }
}

function toCursorInput(cursor: SaleCursor | null) {
  if (!cursor) return null;
  const saleDate = new Date(cursor.saleDate);
  if (Number.isNaN(saleDate.getTime())) return null;
  return { saleDate, id: cursor.id };
}

function applyCursorLimit(list: SaleCursor[], base: number, max: number) {
  if (list.length <= max) {
    return { list, base };
  }
  const overflow = list.length - max;
  return { list: list.slice(overflow), base: base + overflow };
}

function formatCurrency(amount: string | number) {
  const num = Number(amount ?? 0);
  if (!Number.isFinite(num)) return "0";
  return num.toLocaleString("bn-BD", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

function buildSalesHref({
  shopId,
  page,
  from,
  to,
  cursors,
  cursorBase,
}: {
  shopId: string;
  page?: number;
  from: string;
  to: string;
  cursors?: SaleCursor[];
  cursorBase?: number;
}) {
  const params = new URLSearchParams();
  params.set("shopId", shopId);
  params.set("from", from);
  params.set("to", to);
  if (page && page > 1) {
    params.set("page", `${page}`);
    if (cursorBase) {
      params.set("cursorBase", `${cursorBase}`);
    }
    if (cursors && cursors.length > 0) {
      params.set("cursors", encodeCursorList(cursors));
    }
  }
  return `/dashboard/sales?${params.toString()}`;
}

async function voidSaleAction(formData: FormData) {
  "use server";
  const saleId = formData.get("saleId");
  const reason = formData.get("reason");
  if (!saleId || typeof saleId !== "string") return;

  try {
    await voidSale(
      saleId,
      typeof reason === "string" && reason.trim() ? reason.trim() : null
    );
  } catch (error) {
    console.error("Failed to void sale", error);
  } finally {
    revalidatePath("/dashboard/sales", "page");
  }
}

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const shops = await getShopsByUser();
  const resolvedSearch = await searchParams;

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">
          কোন দোকান নেই
        </h1>
        <p className="mb-6 text-muted-foreground">
          বিক্রি দেখতে প্রথমে দোকান যুক্ত করুন
        </p>
        <Link
          href="/dashboard/shops/new"
          className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors"
        >
          নতুন দোকান তৈরি করুন
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
    resolvedSearch?.shopId && shops.some((s) => s.id === resolvedSearch.shopId)
      ? resolvedSearch.shopId
      : cookieSelectedShopId ?? shops[0].id;
  const selectedShop = shops.find((s) => s.id === selectedShopId)!;

  const todayStr = getDhakaDateString();
  const rawFrom = normalizeDateInput(resolvedSearch?.from);
  const rawTo = normalizeDateInput(resolvedSearch?.to);
  const fromInput = rawFrom ?? rawTo ?? todayStr;
  const toInput = rawTo ?? fromInput;

  let fromDate = parseDateInput(fromInput) ?? parseDateInput(todayStr)!;
  let toDate = parseDateInput(toInput) ?? fromDate;
  if (toDate < fromDate) {
    toDate = fromDate;
  }

  const fromStr = formatDateInput(fromDate);
  const toStr = formatDateInput(toDate);
  const { start: rangeStart, endExclusive: rangeEndExclusive } =
    getDhakaRangeFromDays(fromStr, toStr);

  let page = parsePositiveInt(resolvedSearch?.page) ?? 1;
  let cursorList = decodeCursorList(resolvedSearch?.cursors);
  const cursorBaseParam = parsePositiveInt(resolvedSearch?.cursorBase);
  let cursorBase =
    cursorBaseParam ??
    (page > 1 ? Math.max(2, page - cursorList.length + 1) : 2);

  if (cursorBase < 2) {
    cursorBase = 2;
  }

  if (page <= 1) {
    page = 1;
    cursorList = [];
    cursorBase = 2;
  } else {
    const limited = applyCursorLimit(
      cursorList,
      cursorBase,
      MAX_CURSOR_HISTORY
    );
    cursorList = limited.list;
    cursorBase = limited.base;

    const requiredLength = page - cursorBase + 1;
    if (requiredLength < 1 || cursorList.length < requiredLength) {
      page = 1;
      cursorList = [];
      cursorBase = 2;
    } else if (cursorList.length > requiredLength) {
      cursorList = cursorList.slice(0, requiredLength);
    }
  }

  const currentCursor = page > 1 ? cursorList[page - cursorBase] ?? null : null;

  const [{ items: sales, nextCursor, hasMore }, summary] = await Promise.all([
    getSalesByShopPaginated({
      shopId: selectedShopId,
      limit: PAGE_SIZE,
      cursor: toCursorInput(currentCursor),
      dateFrom: rangeStart,
      dateTo: rangeEndExclusive,
    }),
    getSalesSummary({
      shopId: selectedShopId,
      dateFrom: rangeStart,
      dateTo: rangeEndExclusive,
    }),
  ]);

  const buildPageLink = (targetPage: number) => {
    if (targetPage <= 1) {
      return buildSalesHref({
        shopId: selectedShopId,
        from: fromStr,
        to: toStr,
      });
    }

    if (targetPage === page + 1 && nextCursor) {
      const nextList = [...cursorList, nextCursor];
      const limited = applyCursorLimit(
        nextList,
        cursorBase,
        MAX_CURSOR_HISTORY
      );
      return buildSalesHref({
        shopId: selectedShopId,
        page: targetPage,
        from: fromStr,
        to: toStr,
        cursors: limited.list,
        cursorBase: limited.base,
      });
    }

    if (targetPage <= page) {
      if (targetPage < cursorBase) return null;
      const requiredLength = targetPage - cursorBase + 1;
      if (requiredLength < 1 || cursorList.length < requiredLength) {
        return null;
      }
      const targetCursors = cursorList.slice(0, requiredLength);
      return buildSalesHref({
        shopId: selectedShopId,
        page: targetPage,
        from: fromStr,
        to: toStr,
        cursors: targetCursors,
        cursorBase,
      });
    }

    return null;
  };

  const prevHref = page > 1 ? buildPageLink(page - 1) : null;
  const nextHref = hasMore ? buildPageLink(page + 1) : null;

  const clientSales = sales.map((s) => ({
    id: s.id,
    totalAmount:
      (s.totalAmount as any)?.toString?.() ??
      s.totalAmount?.toString?.() ??
      "0",
    paymentMethod: s.paymentMethod,
    status: (s as any).status ?? "COMPLETED",
    voidReason: (s as any).voidReason ?? null,
    createdAt: s.saleDate.toISOString(),
    itemCount: (s as any).itemCount ?? 0,
    itemPreview: (s as any).itemPreview ?? "",
    customerName: (s as any).customerName ?? null,
  }));

  const summaryTotalDisplay = formatCurrency(summary.totalAmount);
  const isAllTime = fromStr === "1970-01-01" && toStr === "2099-12-31";
  const rangeLabel = isAllTime
    ? "সব সময়"
    : fromStr === toStr
    ? fromStr
    : `${fromStr} – ${toStr}`;

  return (
    <div className="space-y-4 sm:space-y-5 section-gap pb-[128px] sm:pb-[110px]">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_16px_36px_rgba(15,23,42,0.08)] animate-fade-in">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-card to-card" />
        <div className="pointer-events-none absolute -top-20 right-0 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative space-y-3 p-3 sm:space-y-4 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                বিক্রির সারসংক্ষেপ
              </p>
              <p className="text-3xl font-bold text-foreground leading-tight tracking-tight sm:text-4xl">
                ৳ {summaryTotalDisplay}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
                দোকান:
                <span className="truncate font-semibold text-foreground">
                  {selectedShop.name}
                </span>
              </p>
            </div>
            <div className="w-full sm:w-auto">
              <DateFilterClient
                shopId={selectedShopId}
                from={fromStr}
                to={toStr}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex h-7 items-center gap-1 rounded-full bg-card/80 px-3 font-semibold text-foreground border border-border shadow-[0_1px_0_rgba(0,0,0,0.03)]">
                {summary.count} বিল
              </span>
              <span className="inline-flex h-7 items-center gap-1 rounded-full bg-card/80 px-3 font-semibold text-muted-foreground border border-border">
                {rangeLabel}
              </span>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
              <div className="w-full sm:w-[200px]">
                <ShopSelectorClient
                  shops={shops}
                  selectedShopId={selectedShopId}
                  from={fromStr}
                  to={toStr}
                />
              </div>
              <Link
                href={`/dashboard/sales/new?shopId=${selectedShopId}`}
                className="hidden sm:inline-flex h-10 items-center gap-2 rounded-full bg-primary-soft text-primary border border-primary/30 px-3 text-sm font-semibold shadow-sm hover:bg-primary/15 hover:border-primary/40 transition"
              >
                ➕ নতুন বিক্রি
              </Link>
            </div>
          </div>
        </div>
      </div>

      <SalesListClient
        shopId={selectedShopId}
        sales={clientSales}
        page={page}
        prevHref={prevHref}
        nextHref={nextHref}
        hasMore={Boolean(hasMore)}
        voidSaleAction={voidSaleAction}
      />
    </div>
  );
}
