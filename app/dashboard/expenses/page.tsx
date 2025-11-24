import Link from "next/link";
import { getShopsByUser } from "@/app/actions/shops";
import { getExpensesByShop } from "@/app/actions/expenses";

type ExpensePageProps = {
  searchParams?: {
    shopId?: string;
  };
};

export default async function ExpensesPage({ searchParams }: ExpensePageProps) {
  const shops = await getShopsByUser();

  if (!shops || shops.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-bold mb-4">Expenses</h1>
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

  const rows = await getExpensesByShop(selectedShopId);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-bold">Expenses</h1>
          <p className="text-sm text-gray-600">
            Shop: <span className="font-semibold">{selectedShop.name}</span>
          </p>
        </div>

        <div className="flex gap-2">
          <select
            className="border px-2 py-1"
            defaultValue={selectedShopId}
            onChange={(e) => {
              window.location.href = `/dashboard/expenses?shopId=${e.target.value}`;
            }}
          >
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name}
              </option>
            ))}
          </select>

          <Link
            href={`/dashboard/expenses/new?shopId=${selectedShopId}`}
            className="px-4 py-2 bg-black text-white rounded"
          >
            New Expense
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <p>No expenses for this shop yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((e) => (
            <div
              key={e.id}
              className="border rounded p-3 flex justify-between items-center"
            >
              <div>
                <p className="font-semibold">৳ {e.amount}</p>
                <p className="text-sm text-gray-700">{e.category}</p>
                <p className="text-xs text-gray-500">{e.expenseDate}</p>
              </div>

              <div className="flex gap-2 items-center">
                <Link
                  href={`/dashboard/expenses/${e.id}`}
                  className="px-3 py-1 border rounded"
                >
                  Edit
                </Link>

                <form
                  action={async () => {
                    "use server";
                    const { deleteExpense } = await import(
                      "@/app/actions/expenses"
                    );
                    await deleteExpense(e.id);
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
