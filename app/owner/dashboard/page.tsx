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
        <h1 className="text-2xl font-bold text-gray-900">ড্যাশবোর্ড</h1>
        <p className="mt-4 text-gray-600">প্রথমে একটি দোকান তৈরি করুন।</p>
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
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 leading-tight">
              ড্যাশবোর্ড
            </h1>
            <p className="text-sm text-gray-500 mt-1 leading-snug">
              আজকের সারসংক্ষেপ, বিক্রি ও খরচ
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card
            title="আজকের বিক্রি"
            value={`${Number(summary?.sales?.total ?? summary?.sales ?? 0).toFixed(2)} ৳`}
            color="bg-emerald-500"
            icon="💰"
          />

          <Card
            title="আজকের খরচ"
            value={`${Number(summary?.expenses?.total ?? summary?.expenses ?? 0).toFixed(2)} ৳`}
            color="bg-red-500"
            icon="💸"
          />

          <Card
            title="আজকের লাভ"
            value={`${Number(summary?.profit ?? 0).toFixed(2)} ৳`}
            color="bg-blue-600"
            icon="📈"
          />

          <Card
            title="ক্যাশ ব্যালেন্স"
            value={`${Number(summary?.cash?.balance ?? summary?.balance ?? 0).toFixed(2)} ৳`}
            color="bg-amber-400"
            icon="🏦"
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">দ্রুত কাজ</h2>
        <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
          <Link
            href={`/dashboard/sales/new?shopId=${selectedShopId}`}
            className="block bg-blue-50 border border-blue-100 text-blue-800 font-semibold rounded-lg py-4 px-3 text-base text-center transition-colors hover:border-blue-200 hover:bg-blue-100 pressable card-lift h-full"
          >
            <span className="flex flex-col items-center gap-1">
              <span className="text-xl">⚡</span>
              <span>নতুন বিক্রি শুরু করুন</span>
            </span>
          </Link>
          <Link
            href={`/dashboard/due?shopId=${selectedShopId}`}
            className="block bg-emerald-50 border border-emerald-100 text-emerald-800 font-semibold rounded-lg py-4 px-3 text-base text-center transition-colors hover:border-emerald-200 hover:bg-emerald-100 pressable card-lift h-full"
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
    "bg-emerald-500": "bg-emerald-50 text-emerald-900",
    "bg-red-500": "bg-red-50 text-red-900",
    "bg-blue-600": "bg-blue-50 text-blue-900",
    "bg-amber-400": "bg-amber-50 text-amber-900",
  };
  const iconBg: Record<string, string> = {
    "bg-emerald-500": "bg-emerald-100 text-emerald-700",
    "bg-red-500": "bg-red-100 text-red-700",
    "bg-blue-600": "bg-blue-100 text-blue-700",
    "bg-amber-400": "bg-amber-100 text-amber-700",
  };

  return (
    <div
      className={`p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all pressable ${
        styles[color] ?? "bg-white text-slate-900"
      }`}
    >
      <div className="flex items-start gap-3">
        {icon ? (
          <span
            className={`inline-flex items-center justify-center h-9 w-9 rounded-full ${
              iconBg[color] ?? "bg-slate-100 text-slate-700"
            }`}
          >
            {icon}
          </span>
        ) : null}
        <div>
          <p className="text-sm font-semibold opacity-80 mb-1">{title}</p>
          <h2 className="text-2xl font-bold leading-tight">{value}</h2>
        </div>
      </div>
    </div>
  );
}
