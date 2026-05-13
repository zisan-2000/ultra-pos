import Link from "next/link";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";
import { getShopsByUser } from "@/app/actions/shops";
import { prisma } from "@/lib/prisma";
import { Breadcrumb } from "@/components/ui/breadcrumb";

type Props = {
  searchParams?: Promise<{ shopId?: string; range?: string; productId?: string }>;
};

type ExpiryRow = {
  id: string;
  source: "batch" | "product";
  productId: string;
  productName: string;
  variantLabel?: string | null;
  batchNo?: string | null;
  expiryDate: string;
  remainingQty: number;
  baseUnit: string;
  genericName?: string | null;
  strength?: string | null;
  dosageForm?: string | null;
  manufacturer?: string | null;
};

function daysUntil(expiryDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${expiryDate}T00:00:00`);
  return Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
}

function statusFor(days: number) {
  if (days < 0) {
    return {
      label: "মেয়াদ শেষ",
      tone: "border-red-200 bg-red-50 text-red-700",
      rowTone: "border-red-100 bg-red-50/50",
    };
  }
  if (days <= 30) {
    return {
      label: `${days} দিন বাকি`,
      tone: "border-amber-200 bg-amber-50 text-amber-700",
      rowTone: "border-amber-100 bg-amber-50/40",
    };
  }
  if (days <= 90) {
    return {
      label: `${days} দিন বাকি`,
      tone: "border-sky-200 bg-sky-50 text-sky-700",
      rowTone: "border-sky-100 bg-sky-50/30",
    };
  }
  return {
    label: `${days} দিন বাকি`,
    tone: "border-green-200 bg-green-50 text-green-700",
    rowTone: "border-border bg-card",
  };
}

export default async function ProductExpiryPage({ searchParams }: Props) {
  const [user, shops, resolvedSearch] = await Promise.all([
    requireUser(),
    getShopsByUser(),
    searchParams,
  ]);

  if (!hasPermission(user, "view_products")) {
    return <div className="py-12 text-center font-semibold text-danger">অ্যাকসেস সীমাবদ্ধ</div>;
  }

  if (!shops || shops.length === 0) {
    return <div className="py-12 text-center text-muted-foreground">কোনো দোকান নেই।</div>;
  }

  const cookieStore = await cookies();
  const cookieShopId = cookieStore.get("activeShopId")?.value;
  const selectedProductId =
    typeof resolvedSearch?.productId === "string" ? resolvedSearch.productId : "";
  const selectedShopId =
    resolvedSearch?.shopId && shops.some((s) => s.id === resolvedSearch.shopId)
      ? resolvedSearch.shopId
      : cookieShopId && shops.some((s) => s.id === cookieShopId)
        ? cookieShopId
        : shops[0].id;

  await assertShopAccess(selectedShopId, user);
  const selectedShop = shops.find((s) => s.id === selectedShopId)!;

  const [batches, products] = await Promise.all([
    prisma.batch.findMany({
      where: {
        shopId: selectedShopId,
        ...(selectedProductId ? { productId: selectedProductId } : {}),
        remainingQty: { gt: 0 },
        expiryDate: { not: null },
      },
      orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
      take: 500,
      select: {
        id: true,
        batchNo: true,
        expiryDate: true,
        remainingQty: true,
        product: {
          select: {
            id: true,
            name: true,
            baseUnit: true,
            genericName: true,
            strength: true,
            dosageForm: true,
            manufacturer: true,
          },
        },
        variant: { select: { label: true } },
      },
    }),
    prisma.product.findMany({
      where: {
        shopId: selectedShopId,
        ...(selectedProductId ? { id: selectedProductId } : {}),
        expiryDate: { not: null },
        trackBatch: false,
        stockQty: { gt: 0 },
      },
      orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
      take: 500,
      select: {
        id: true,
        name: true,
        baseUnit: true,
        expiryDate: true,
        stockQty: true,
        genericName: true,
        strength: true,
        dosageForm: true,
        manufacturer: true,
      },
    }),
  ]);

  const rows: ExpiryRow[] = [
    ...batches.map((b) => ({
      id: b.id,
      source: "batch" as const,
      productId: b.product.id,
      productName: b.product.name,
      variantLabel: b.variant?.label ?? null,
      batchNo: b.batchNo,
      expiryDate: b.expiryDate!.toISOString().slice(0, 10),
      remainingQty: Number(b.remainingQty ?? 0),
      baseUnit: b.product.baseUnit || "pcs",
      genericName: b.product.genericName,
      strength: b.product.strength,
      dosageForm: b.product.dosageForm,
      manufacturer: b.product.manufacturer,
    })),
    ...products.map((p) => ({
      id: p.id,
      source: "product" as const,
      productId: p.id,
      productName: p.name,
      variantLabel: null,
      batchNo: null,
      expiryDate: p.expiryDate!.toISOString().slice(0, 10),
      remainingQty: Number(p.stockQty ?? 0),
      baseUnit: p.baseUnit || "pcs",
      genericName: p.genericName,
      strength: p.strength,
      dosageForm: p.dosageForm,
      manufacturer: p.manufacturer,
    })),
  ].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

  const expired = rows.filter((row) => daysUntil(row.expiryDate) < 0).length;
  const within30 = rows.filter((row) => {
    const days = daysUntil(row.expiryDate);
    return days >= 0 && days <= 30;
  }).length;
  const within60 = rows.filter((row) => {
    const days = daysUntil(row.expiryDate);
    return days >= 31 && days <= 60;
  }).length;
  const within90 = rows.filter((row) => {
    const days = daysUntil(row.expiryDate);
    return days >= 61 && days <= 90;
  }).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      <Breadcrumb
        items={[
          { label: "হোম", href: "/dashboard" },
          { label: "পণ্য", href: `/dashboard/products?shopId=${selectedShopId}` },
          { label: "মেয়াদ উত্তীর্ণ" },
        ]}
        className="mb-2"
      />
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">ফার্মেসি রিপোর্ট</p>
        <h1 className="text-2xl font-bold text-foreground leading-tight">Expiry Dashboard</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          দোকান: <span className="font-semibold">{selectedShop.name}</span> — batch ও product expiry একসাথে
        </p>
        {selectedProductId ? (
          <p className="mt-1 text-xs font-semibold text-amber-700">
            filtered by selected product
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-semibold text-red-700">মেয়াদ শেষ</p>
          <p className="mt-1 text-2xl font-extrabold text-red-800">{expired}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold text-amber-700">৩০ দিনের মধ্যে</p>
          <p className="mt-1 text-2xl font-extrabold text-amber-800">{within30}</p>
        </div>
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
          <p className="text-xs font-semibold text-sky-700">৬০ দিনের মধ্যে</p>
          <p className="mt-1 text-2xl font-extrabold text-sky-800">{within60}</p>
        </div>
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="text-xs font-semibold text-green-700">৯০ দিনের মধ্যে</p>
          <p className="mt-1 text-2xl font-extrabold text-green-800">{within90}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-foreground">Expiry list</p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/dashboard/products/batches?shopId=${selectedShopId}`} className="h-9 rounded-full border border-border px-4 py-2 text-xs font-semibold hover:bg-muted">
              Batch view
            </Link>
            <Link href={`/dashboard/products?shopId=${selectedShopId}`} className="h-9 rounded-full border border-border px-4 py-2 text-xs font-semibold hover:bg-muted">
              Product list
            </Link>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            এখন কোনো expiry-tracked stock নেই। Purchase/stock-in করার সময় batch expiry দিন।
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => {
              const days = daysUntil(row.expiryDate);
              const status = statusFor(days);
              const meta = [row.genericName, row.strength, row.dosageForm, row.manufacturer]
                .filter(Boolean)
                .join(" · ");
              return (
                <div key={`${row.source}-${row.id}`} className={`rounded-2xl border p-3 ${status.rowTone}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-bold text-foreground">
                        {row.productName}{row.variantLabel ? ` (${row.variantLabel})` : ""}
                      </p>
                      {meta ? <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p> : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.batchNo ? `Batch: ${row.batchNo}` : "Product expiry"} · Stock {row.remainingQty.toFixed(2)} {row.baseUnit}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-bold text-foreground">
                        {row.expiryDate}
                      </span>
                      <span className={`rounded-full border px-3 py-1 text-xs font-bold ${status.tone}`}>
                        {status.label}
                      </span>
                      <Link href={`/dashboard/products/${row.productId}?shopId=${selectedShopId}`} className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted">
                        খুলুন
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
