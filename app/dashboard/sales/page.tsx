// app/dashboard/sales/page.tsx

import Link from "next/link";
import { getShopsByUser } from "@/app/actions/shops";
import { getSalesByShop } from "@/app/actions/sales";

type SalesPageProps = {
  searchParams?: {
    shopId?: string;
  };
};

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const shops = await getShopsByUser();

  if (!shops || shops.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-bold mb-4">Sales</h1>
        <p className="mb-4">You don&apos;t have any shop yet.</p>
        <Link
          href="/dashboard/shops/new"
          className="px-4 py-2 bg-black text-white rounded"
        >
          Create your first shop
        </Link>
      </div>
    );
  }

  const selectedShopId =
    searchParams?.shopId && shops.some((s) => s.id === searchParams.shopId)
      ? searchParams.shopId
      : shops[0].id;

  const selectedShop = shops.find((s) => s.id === selectedShopId)!;

  const sales = await getSalesByShop(selectedShopId);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-bold">Sales</h1>
          <p className="text-sm text-gray-600">
            Shop: <span className="font-semibold">{selectedShop.name}</span>
          </p>
        </div>

        <div className="flex gap-2 items-center">
          <select
            className="border px-2 py-1"
            defaultValue={selectedShopId}
            onChange={(e) => {
              window.location.href = `/dashboard/sales?shopId=${e.target.value}`;
            }}
          >
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name}
              </option>
            ))}
          </select>

          <Link
            href={`/dashboard/sales/new?shopId=${selectedShopId}`}
            className="px-4 py-2 bg-black text-white rounded"
          >
            New Sale
          </Link>
        </div>
      </div>

      {sales.length === 0 ? (
        <p>No sales yet for this shop.</p>
      ) : (
        <div className="space-y-3">
          {sales.map((s) => (
            <div
              key={s.id}
              className="border rounded p-3 flex justify-between items-center"
            >
              <div>
                <p className="font-semibold">Total: {s.totalAmount}</p>
                <p className="text-sm text-gray-600">
                  Payment: {s.paymentMethod || "cash"}
                </p>
              </div>
              <p className="text-xs text-gray-500">
                {s.createdAt
                  ? new Date(s.createdAt as any).toLocaleString()
                  : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
