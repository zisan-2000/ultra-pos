// app/owner/dashboard/page.tsx

import Link from "next/link";
import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";

type DashboardPageProps = {
  searchParams?: Promise<{ shopId?: string } | undefined>;
};

async function fetchSummary(shopId: string, cookieHeader: string) {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";

  const res = await fetch(
    `${baseUrl}/api/reports/today-summary?shopId=${shopId}`,
    {
      cache: "no-store",
      headers: {
        cookie: cookieHeader,
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to load summary (${res.status})`);
  }

  return await res.json();
}

export default async function OwnerDashboardPage({
  searchParams,
}: DashboardPageProps) {
  const shops = await getShopsByUser();

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-foreground">ড্যাশবোর্ড</h1>
        <p className="mt-4 text-muted-foreground">প্রথমে একটি দোকান তৈরি করুন।</p>
      </div>
    );
  }

  const resolvedSearch = await searchParams;
  const cookieStore = await cookies();
  const cookieShopId = cookieStore.get("activeShopId")?.value;
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join("; ");

  const cookieSelectedShopId =
    cookieShopId && shops.some((s) => s.id === cookieShopId)
      ? cookieShopId
      : null;

  const selectedShopId =
    resolvedSearch?.shopId && shops.some((s) => s.id === resolvedSearch.shopId)
      ? resolvedSearch.shopId
      : cookieSelectedShopId ?? shops[0].id;

  const summary = await fetchSummary(selectedShopId, cookieHeader);

  return (
    <div className="space-y-6 section-gap">
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground leading-tight">
              ড্যাশবোর্ড
            </h1>
            <p className="text-sm text-muted-foreground mt-1 leading-snug">
              আজকের সারসংক্ষেপ, বিক্রি ও খরচ
            </p>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card
            title="আজকের বিক্রি"
            value={`${Number(summary?.sales?.total ?? summary?.sales ?? 0).toFixed(2)} ৳`}
            color="success"
            icon="💰"
          />

          <Card
            title="আজকের খরচ"
            value={`${Number(summary?.expenses?.total ?? summary?.expenses ?? 0).toFixed(2)} ৳`}
            color="danger"
            icon="💸"
          />

          <Card
            title="আজকের লাভ"
            value={`${Number(summary?.profit ?? 0).toFixed(2)} ৳`}
            color="primary"
            icon="📈"
          />

          <Card
            title="ক্যাশ ব্যালেন্স"
            value={`${Number(summary?.cash?.balance ?? summary?.balance ?? 0).toFixed(2)} ৳`}
            color="warning"
            icon="🏦"
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground mb-3">দ্রুত কাজ</h2>
        <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
          <Link
            href={`/dashboard/sales/new?shopId=${selectedShopId}`}
            className="block bg-primary-soft border border-primary/30 text-primary font-semibold rounded-lg py-4 px-3 text-base text-center transition-colors hover:border-primary/50 hover:bg-primary/20 pressable card-lift h-full"
          >
            <span className="flex flex-col items-center gap-1">
              <span className="text-xl">⚡</span>
              <span>নতুন বিক্রি শুরু করুন</span>
            </span>
          </Link>
          <Link
            href={`/dashboard/due?shopId=${selectedShopId}`}
            className="block bg-warning-soft border border-warning/30 text-warning font-semibold rounded-lg py-4 px-3 text-base text-center transition-colors hover:border-warning/50 hover:bg-warning/20 pressable card-lift h-full"
          >
            <span className="flex flex-col items-center gap-1">
              <span className="text-xl">🧾</span>
              <span>ধার / বাকি লিখে রাখুন</span>
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  value,
  color,
  icon,
}: {
  title: string;
  value: string;
  color: string;
  icon?: string;
}) {
  const styles: Record<string, string> = {
    success: "bg-success-soft",
    danger: "bg-danger-soft",
    primary: "bg-primary-soft",
    warning: "bg-warning-soft",
  };
  const iconBg: Record<string, string> = {
    success: "bg-success/15 text-success",
    danger: "bg-danger/15 text-danger",
    primary: "bg-primary/15 text-primary",
    warning: "bg-warning/15 text-warning",
  };
  const trimmed = value.trim();
  const parts = trimmed.split(/\s+/);
  const currency = parts.length > 1 ? parts.pop() || "" : "";
  const amount = parts.join(" ");

  return (
    <div
      className={`p-5 rounded-2xl border border-border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all pressable ${
        styles[color] ?? "bg-card text-foreground"
      }`}
    >
      <div className="flex items-start gap-3">
        {icon ? (
          <span
            className={`inline-flex items-center justify-center h-8 w-8 rounded-full text-[18px] ${
              iconBg[color] ?? "bg-muted text-muted-foreground"
            }`}
          >
            {icon}
          </span>
        ) : null}
        <div className="space-y-3">
          <p className="text-[13px] font-medium text-foreground/80">{title}</p>
          <div className="flex items-end gap-1">
            <span className="text-[30px] font-extrabold text-foreground leading-none">
              {amount}
            </span>
            {currency ? (
              <span className="text-xs text-muted-foreground pb-1">{currency}</span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
