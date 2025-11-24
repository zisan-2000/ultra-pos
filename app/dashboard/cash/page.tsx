// app/dashboard/cash/page.tsx

import Link from "next/link";
import { getShopsByUser } from "@/app/actions/shops";
import { getCashByShop } from "@/app/actions/cash";

type CashPageProps = {
  searchParams?: { shopId?: string };
};

export default async function CashPage({ searchParams }: CashPageProps) {
  const shops = await getShopsByUser();

  if (!shops || shops.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-bold mb-4">Cashbook</h1>
        <p>You need to create a shop first.</p>
        <Link
          href="/dashboard/shops/new"
          className="px-4 py-2 bg-black text-white rounded"
        >
          Create Shop
        </Link>
      </div>
    );
  }

  const selectedShopId =
    searchParams?.shopId && shops.some((s) => s.id === searchParams.shopId)
      ? searchParams.shopId
      : shops[0].id;

  const selectedShop = shops.find((s) => s.id === selectedShopId)!;

  const rows = await getCashByShop(selectedShopId);

  const balance = rows.reduce((sum, e) => {
    const amt = Number(e.amount);
    return e.entryType === "IN" ? sum + amt : sum - amt;
  }, 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-bold">Cashbook</h1>
          <p className="text-sm text-gray-600">
            Shop: <b>{selectedShop.name}</b>
          </p>
          <p className="text-sm mt-1">
            <b>Balance:</b> {balance.toFixed(2)} ৳
          </p>
        </div>

        <div className="flex gap-2">
          <select
            className="border p-2"
            defaultValue={selectedShopId}
            onChange={(e) => {
              window.location.href = `/dashboard/cash?shopId=${e.target.value}`;
            }}
          >
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name}
              </option>
            ))}
          </select>

          <Link
            href={`/dashboard/cash/new?shopId=${selectedShopId}`}
            className="px-4 py-2 bg-black text-white rounded"
          >
            New Entry
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <p>No cash entries yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((e) => (
            <div
              key={e.id}
              className="p-3 border rounded flex justify-between items-center"
            >
              <div>
                <p className="font-semibold">
                  {e.entryType === "IN" ? "+" : "-"}
                  {e.amount} ৳
                </p>
                <p className="text-sm text-gray-600">{e.reason}</p>
              </div>

              <div className="flex gap-2">
                <Link
                  href={`/dashboard/cash/${e.id}`}
                  className="px-3 py-1 border rounded"
                >
                  Edit
                </Link>

                <form
                  action={async () => {
                    "use server";
                    const { deleteCashEntry } = await import(
                      "@/app/actions/cash"
                    );
                    await deleteCashEntry(e.id);
                  }}
                >
                  <button className="px-3 py-1 bg-red-500 text-white rounded text-sm">
                    Delete
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
