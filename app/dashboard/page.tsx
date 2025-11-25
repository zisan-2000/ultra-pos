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
      <div className="p-6">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <p className="mt-2">First create a shop.</p>
      </div>
    );
  }

  const shopId = shops[0].id;
  const summary = await fetchSummary(shopId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard Overview</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card
          title="আজকের বিক্রি"
          value={`${(summary?.sales ?? 0).toFixed(2)} ৳`}
          color="bg-green-600"
        />

        <Card
          title="আজকের খরচ"
          value={`${(summary?.expenses ?? 0).toFixed(2)} ৳`}
          color="bg-red-600"
        />

        <Card
          title="আজকের লাভ"
          value={`${(summary?.profit ?? 0).toFixed(2)} ৳`}
          color="bg-blue-600"
        />

        <Card
          title="ক্যাশ ব্যালেন্স"
          value={`${(summary?.balance ?? 0).toFixed(2)} ৳`}
          color="bg-yellow-500"
        />
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
    <div className={`p-4 rounded text-white ${color}`}>
      <p className="text-sm opacity-90">{title}</p>
      <h2 className="text-xl font-bold">{value}</h2>
    </div>
  );
}
