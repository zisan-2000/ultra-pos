import { getShopsByUser } from "@/app/actions/shops";

async function fetchSummary(shopId: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL}/api/reports/today-summary?shopId=${shopId}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    throw new Error(`Failed to load summary (${res.status})`);
  }

  return await res.json();
}

export default async function DashboardPage() {
  const shops = await getShopsByUser();

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900">ড্যাশবোর্ড</h1>
        <p className="mt-4 text-gray-600">প্রথমে একটি দোকান তৈরি করুন।</p>
      </div>
    );
  }

  const shopId = shops[0].id;
  const summary = await fetchSummary(shopId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">ড্যাশবোর্ড</h1>
      </div>

      {/* Summary Cards - 2x2 Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card
          title="আজকের বিক্রি"
          value={`${(summary?.sales ?? 0).toFixed(2)} ৳`}
          color="bg-emerald-500"
        />

        <Card
          title="আজকের খরচ"
          value={`${(summary?.expenses ?? 0).toFixed(2)} ৳`}
          color="bg-red-500"
        />

        <Card
          title="আজকের লাভ"
          value={`${(summary?.profit ?? 0).toFixed(2)} ৳`}
          color="bg-blue-600"
        />

        <Card
          title="ক্যাশ ব্যালেন্স"
          value={`${(summary?.balance ?? 0).toFixed(2)} ৳`}
          color="bg-amber-400"
        />
      </div>

      {/* Quick Action Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <a
          href="/dashboard/sales/new"
          className="block bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg py-4 text-lg text-center transition-colors"
        >
          ➕ নতুন বিক্রি শুরু করুন
        </a>
        <a
          href="/dashboard/due"
          className="block bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-lg py-4 text-lg text-center transition-colors"
        >
          📝 ধার / বাকি লিখে রাখুন
        </a>
      </div>
    </div>
  );
}

function Card({
  title,
  value,
  color,
}: {
  title: string;
  value: string;
  color: string;
}) {
  return (
    <div className={`p-8 rounded-lg text-white ${color} shadow-md hover:shadow-lg transition-shadow`}>
      <p className="text-base opacity-90 mb-3">{title}</p>
      <h2 className="text-3xl font-bold">{value}</h2>
    </div>
  );
}
