// app/dashboard/products/page.tsx

import Link from "next/link";
import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import { getProductsByShopCursorPaginated } from "@/app/actions/products";
import { listActiveBusinessProductTemplates } from "@/app/actions/business-product-templates";
import { listActiveBusinessTypes } from "@/app/actions/business-types";
import ProductsListClient from "./components/ProductsListClient";
import { businessOptions } from "@/lib/productFormConfig";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import {
  buildCursorPageLink,
  decodeCursorList,
  encodeCursorList,
  normalizeCursorPageState,
  toCursorInput,
} from "@/lib/cursor-pagination";

type PageProps = {
  searchParams?: Promise<{
    shopId?: string;
    page?: string;
    cursors?: string;
    cursorBase?: string;
    q?: string;
    status?: string;
  }>;
};

const PAGE_SIZE = 12;
const MAX_CURSOR_HISTORY = 20;

function parsePositiveInt(value?: string) {
  if (!value) return null;
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function normalizeQuery(value?: string) {
  if (!value) return "";
  return value.toString().trim();
}

function normalizeStatus(value?: string) {
  if (value === "active" || value === "inactive") return value;
  return "all";
}

export default async function ProductsPage({ searchParams }: PageProps) {
  const shops = await getShopsByUser();

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">কোন দোকান নেই</h1>
        <p className="mb-6 text-muted-foreground">আগে একটি দোকান তৈরি করুন</p>
        <Link
          href="/dashboard/shops/new"
          className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors"
        >
          নতুন দোকান তৈরি করুন
        </Link>
      </div>
    );
  }

  const resolvedParams = await searchParams;
  const requestedShopId = resolvedParams?.shopId;

  const cookieStore = await cookies();
  const cookieShopId = cookieStore.get("activeShopId")?.value;

  const cookieSelectedShopId =
    cookieShopId && shops.some((s) => s.id === cookieShopId)
      ? cookieShopId
      : null;

  const shopIds = shops.map((s) => s.id);

  const urlSelectedShopId =
    requestedShopId && shopIds.includes(requestedShopId)
      ? requestedShopId
      : null;

  const activeShopId = urlSelectedShopId ?? cookieSelectedShopId ?? shops[0].id;
  const activeShop = shops.find((shop) => shop.id === activeShopId) ?? shops[0];
  const businessType = activeShop.businessType || "tea_stall";
  const activeBusinessTypes = await listActiveBusinessTypes().catch(() => []);
  const mergedBusinessTypes = [
    ...activeBusinessTypes.map((t) => ({ id: t.key, label: t.label })),
    ...businessOptions.filter(
      (option) => !activeBusinessTypes.some((t) => t.key === option.id),
    ),
  ];
  const businessLabel =
    mergedBusinessTypes.find((option) => option.id === businessType)?.label ||
    businessType;

  const pageParam = parsePositiveInt(resolvedParams?.page) ?? 1;
  const cursorBaseParam = parsePositiveInt(resolvedParams?.cursorBase) ?? 2;
  const cursorList = decodeCursorList(resolvedParams?.cursors);
  const query = normalizeQuery(resolvedParams?.q);
  const status = normalizeStatus(resolvedParams?.status);

  const normalized = normalizeCursorPageState({
    page: pageParam,
    cursors: cursorList,
    cursorBase: cursorBaseParam,
    maxHistory: MAX_CURSOR_HISTORY,
  });

  const { items, totalCount, nextCursor, hasMore } =
    await getProductsByShopCursorPaginated({
      shopId: activeShopId,
      limit: PAGE_SIZE,
      cursor: toCursorInput(normalized.currentCursor),
      query,
      status,
    });

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
    params.set("shopId", activeShopId);
    const cleanQuery = query.trim();
    if (cleanQuery) params.set("q", cleanQuery);
    if (status !== "all") params.set("status", status);

    if (page && page > 1) {
      params.set("page", `${page}`);
      if (cursorBase) params.set("cursorBase", `${cursorBase}`);
      if (cursors && cursors.length > 0) {
        params.set("cursors", encodeCursorList(cursors));
      }
    }

    return `/dashboard/products?${params.toString()}`;
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

  const templateProducts = await listActiveBusinessProductTemplates(businessType).catch(() => []);
  const user = await requireUser();
  const canCreateProducts = hasPermission(user, "create_product");

  return (
    <div className="space-y-4 sm:space-y-5 section-gap">
      <ProductsListClient
        shops={shops}
        activeShopId={activeShopId}
        businessLabel={businessLabel}
        templateProducts={templateProducts}
        canCreateProducts={canCreateProducts}
        serverProducts={items}
        page={normalized.page}
        prevHref={prevHref}
        nextHref={nextHref}
        hasMore={Boolean(hasMore)}
        totalCount={totalCount}
        initialQuery={query}
        initialStatus={status}
      />
    </div>
  );
}
