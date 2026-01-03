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

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
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
      const createdAt =
        typeof (entry as { createdAt?: unknown }).createdAt === "string"
          ? (entry as { createdAt: string }).createdAt
          : null;
      const id =
        typeof (entry as { id?: unknown }).id === "string"
          ? (entry as { id: string }).id
          : null;
      if (createdAt && id) {
        cursors.push({ createdAt, id });
      }
    }
    return cursors;
  } catch {
    return [];
  }
}

function toCursorInput(cursor: SaleCursor | null) {
  if (!cursor) return null;
  const createdAt = new Date(cursor.createdAt);
  if (Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id: cursor.id };
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
        <h1 className="text-2xl font-bold mb-4 text-foreground">কোন দোকান নেই</h1>
        <p className="mb-6 text-muted-foreground">বিক্রি দেখতে প্রথমে দোকান যুক্ত করুন</p>
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

  const todayStr = formatDateInput(new Date());
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
  const endExclusive = addDays(toDate, 1);

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
    const limited = applyCursorLimit(cursorList, cursorBase, MAX_CURSOR_HISTORY);
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

  const currentCursor =
    page > 1 ? cursorList[page - cursorBase] ?? null : null;

  const [{ items: sales, nextCursor, hasMore }, summary] =
    await Promise.all([
      getSalesByShopPaginated({
        shopId: selectedShopId,
        limit: PAGE_SIZE,
        cursor: toCursorInput(currentCursor),
        dateFrom: fromDate,
        dateTo: endExclusive,
      }),
      getSalesSummary({
        shopId: selectedShopId,
        dateFrom: fromDate,
        dateTo: endExclusive,
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
      const limited = applyCursorLimit(nextList, cursorBase, MAX_CURSOR_HISTORY);
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
      (s.totalAmount as any)?.toString?.() ?? s.totalAmount?.toString?.() ?? "0",
    paymentMethod: s.paymentMethod,
    status: (s as any).status ?? "COMPLETED",
    voidReason: (s as any).voidReason ?? null,
    createdAt: s.createdAt.toISOString(),
    itemCount: (s as any).itemCount ?? 0,
    itemPreview: (s as any).itemPreview ?? "",
    customerName: (s as any).customerName ?? null,
  }));

  const summaryTotalDisplay = formatCurrency(summary.totalAmount);
  const rangeLabel = fromStr === toStr ? fromStr : `${fromStr} – ${toStr}`;

  return (
    <div className="space-y-5 section-gap pb-[110px]">
      <div className="sticky top-0 z-30 bg-background/90 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between gap-3 py-3">
          <div className="leading-tight">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              দোকান
            </p>
            <p className="text-sm font-semibold text-foreground">
              {selectedShop.name}
            </p>
          </div>
          <DateFilterClient shopId={selectedShopId} from={fromStr} to={toStr} />
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-2xl bg-card border border-border p-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">আজকের বিক্রি</p>
              <p className="text-3xl font-bold text-foreground leading-tight">
                ৳ {summaryTotalDisplay}
              </p>
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted text-foreground font-semibold text-xs border border-border shadow-[0_1px_0_rgba(0,0,0,0.02)]">
                  {summary.count} বিল
                </span>
                <span className="text-muted-foreground text-xs">{rangeLabel}</span>
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <ShopSelectorClient
                shops={shops}
                selectedShopId={selectedShopId}
                from={fromStr}
                to={toStr}
              />
              <Link
                href={`/dashboard/sales/new?shopId=${selectedShopId}`}
                className="inline-flex items-center gap-2 rounded-full bg-primary-soft text-primary border border-primary/30 px-3 py-2 text-sm font-semibold shadow-sm hover:bg-primary/15 hover:border-primary/40 transition"
              >
                ➕ নতুন বিক্রি
              </Link>
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

      <Link
        href={`/dashboard/sales/new?shopId=${selectedShopId}`}
        className="fixed bottom-6 right-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-primary border border-primary/30 text-2xl font-bold shadow-lg hover:bg-primary/15 hover:border-primary/40 active:scale-[0.98] transition"
        aria-label="নতুন বিক্রি যোগ করুন"
      >
        +
      </Link>
    </div>
  );
}
