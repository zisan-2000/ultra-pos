// app/dashboard/sales/page.tsx

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { Buffer } from "buffer";
import { getShopsByUser } from "@/app/actions/shops";
import {
  getSalesByShopPaginated,
  voidSale,
  type SaleCursor,
} from "@/app/actions/sales";
import ShopSelectorClient from "./ShopSelectorClient";
import { VoidSaleControls } from "./components/VoidSaleControls";

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
const MAX_PAGE_BUTTONS = 5;

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

function applyCursorLimit(
  list: SaleCursor[],
  base: number,
  max: number
) {
  if (list.length <= max) {
    return { list, base };
  }
  const overflow = list.length - max;
  return { list: list.slice(overflow), base: base + overflow };
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
        <h1 className="text-2xl font-bold mb-4 text-gray-900">বিক্রি তালিকা</h1>
        <p className="mb-6 text-gray-600">এখনও কোনো দোকান নেই।</p>
        <Link
          href="/dashboard/shops/new"
          className="inline-block px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
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

  const currentCursor =
    page > 1 ? cursorList[page - cursorBase] ?? null : null;

  const { items: sales, nextCursor, hasMore } =
    await getSalesByShopPaginated({
      shopId: selectedShopId,
      limit: PAGE_SIZE,
      cursor: toCursorInput(currentCursor),
      dateFrom: fromDate,
      dateTo: endExclusive,
    });

  const totalPages = hasMore ? page + 1 : page;
  const halfWindow = Math.floor(MAX_PAGE_BUTTONS / 2);
  let startPage = Math.max(1, page - halfWindow);
  let endPage = Math.min(totalPages, startPage + MAX_PAGE_BUTTONS - 1);
  startPage = Math.max(1, endPage - MAX_PAGE_BUTTONS + 1);
  const pageNumbers = Array.from(
    { length: endPage - startPage + 1 },
    (_, index) => startPage + index
  );
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = hasMore ? page + 1 : null;

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

  const showPagination = page > 1 || hasMore;
  const prevHref = prevPage ? buildPageLink(prevPage) : null;
  const nextHref = nextPage ? buildPageLink(nextPage) : null;

  return (
    <div className="space-y-6 section-gap">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-700">🧾</span>
            <h1 className="text-3xl font-bold text-gray-900 leading-tight">বিক্রি তালিকা</h1>
          </div>
          <p className="text-sm text-gray-500 mt-2 leading-snug">
            দোকান: <span className="font-semibold">{selectedShop.name}</span>
          </p>
        </div>

        <div className="flex gap-3 items-center w-full lg:w-auto">
          <ShopSelectorClient
            shops={shops}
            selectedShopId={selectedShopId}
            from={fromStr}
            to={toStr}
          />

          <Link
            href={`/dashboard/sales/new?shopId=${selectedShopId}`}
            className="w-full lg:w-auto px-6 py-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg font-semibold hover:border-blue-300 hover:bg-blue-100 transition-colors text-center"
          >
            ➕ নতুন বিক্রি
          </Link>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <form
          method="get"
          className="flex flex-col gap-3 lg:flex-row lg:items-end"
        >
          <input type="hidden" name="shopId" value={selectedShopId} />
          <div className="flex flex-col gap-1">
            <label
              htmlFor="sales-from"
              className="text-xs font-medium text-slate-600"
            >
              শুরু
            </label>
            <input
              id="sales-from"
              name="from"
              type="date"
              defaultValue={fromStr}
              className="border border-slate-200 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="sales-to"
              className="text-xs font-medium text-slate-600"
            >
              শেষ
            </label>
            <input
              id="sales-to"
              name="to"
              type="date"
              defaultValue={toStr}
              className="border border-slate-200 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-md bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition"
          >
            প্রয়োগ করুন
          </button>
        </form>
      </div>

      <div className="space-y-4">
        {sales.length === 0 ? (
          <p className="text-center text-gray-600 py-8 bg-white border border-slate-200 rounded-xl">
            এখনও কোনো বিক্রি নেই।
          </p>
        ) : (
          sales.map((s) => {
            const totalNum = Number(s.totalAmount ?? 0);
            const totalStr = Number.isFinite(totalNum)
              ? totalNum.toFixed(2)
              : s.totalAmount?.toString?.() ?? "0.00";
            const createdAtStr = s.createdAt
              ? new Date(s.createdAt as any).toLocaleString("bn-BD")
              : "";

            const isVoided = (s as any).status === "VOIDED";
            const voidReason = (s as any).voidReason as string | null;
            const canVoid = s.paymentMethod !== "due";
            const voidFormId = `void-sale-form-${s.id}`;

            return (
              <div
                key={s.id}
                className={`bg-white rounded-xl p-5 flex justify-between items-start gap-4 shadow-sm hover:shadow-md card-lift border ${
                  isVoided ? "border-gray-200" : "border-red-200 bg-red-50/60"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold text-gray-900">{totalStr} ৳</p>
                    {isVoided && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                        বাতিলকৃত বিক্রি
                      </span>
                    )}
                  </div>
                  <p className="text-base text-gray-600">
                    পেমেন্ট: {s.paymentMethod === "due" ? "ধার" : s.paymentMethod === "cash" ? "ক্যাশ" : s.paymentMethod}
                    {s.paymentMethod === "due" && s.customerName
                      ? ` • গ্রাহক: ${s.customerName}`
                      : ""}
                  </p>
                  {s.itemCount > 0 && (
                    <p className="text-sm text-gray-500">
                      পণ্য: {s.itemPreview || `${s.itemCount} টি`}
                    </p>
                  )}
                  {isVoided && voidReason && (
                    <p className="text-xs text-red-600 mt-1">
                      কারণ: {voidReason}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <p className="text-sm text-gray-500 text-right">
                    {createdAtStr}
                  </p>
                  {!isVoided && canVoid && (
                    <form
                      id={voidFormId}
                      action={voidSaleAction}
                      className="flex items-center gap-2"
                    >
                      <VoidSaleControls
                        saleId={s.id}
                        isVoided={isVoided}
                        formId={voidFormId}
                      />
                    </form>
                  )}
                  {!isVoided && !canVoid && (
                    <p className="text-xs text-slate-400 text-right">
                      ধার বিক্রি এখানে বাতিল করা যায় না
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {showPagination && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">পৃষ্ঠা {page}</p>
          <div className="flex flex-wrap items-center gap-2">
            {prevHref ? (
              <Link
                href={prevHref}
                className="px-3 py-1 text-sm rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                আগের
              </Link>
            ) : (
              <span className="px-3 py-1 text-sm rounded-md border border-slate-200 text-slate-400">
                আগের
              </span>
            )}

            {pageNumbers.map((pageNumber) => {
              const href = buildPageLink(pageNumber);
              if (pageNumber === page || !href) {
                return (
                  <span
                    key={pageNumber}
                    className="px-3 py-1 text-sm rounded-md border border-slate-200 bg-slate-100 text-slate-700"
                  >
                    {pageNumber}
                  </span>
                );
              }
              return (
                <Link
                  key={pageNumber}
                  href={href}
                  className="px-3 py-1 text-sm rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  {pageNumber}
                </Link>
              );
            })}

            {nextHref ? (
              <Link
                href={nextHref}
                className="px-3 py-1 text-sm rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                পরের
              </Link>
            ) : (
              <span className="px-3 py-1 text-sm rounded-md border border-slate-200 text-slate-400">
                পরের
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
