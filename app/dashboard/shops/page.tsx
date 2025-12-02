// app/dashboard/shops/page.tsx

import Link from "next/link";
import { getShopsByUser, deleteShop } from "@/app/actions/shops";
import { revalidatePath } from "next/cache";

export default async function ShopsPage() {
  const data = await getShopsByUser();

  return (
    <div className="space-y-8 section-gap">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-700">🏪</span>
            <h1 className="text-3xl font-bold text-gray-900 leading-tight">দোকানসমূহ</h1>
          </div>
          <p className="text-gray-600 leading-snug">
            এক জায়গায় সব দোকান পরিচালনা করুন
          </p>
        </div>
        <Link
          href="/dashboard/shops/new"
          className="w-full md:w-auto bg-blue-50 border border-blue-200 text-blue-800 font-bold py-3 px-6 rounded-lg text-lg transition-colors text-center hover:border-blue-300 hover:bg-blue-100"
        >
          + নতুন দোকান
        </Link>
      </div>

      {data.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-600 mb-4">কোনো দোকান নেই</p>
          <Link
            href="/dashboard/shops/new"
            className="inline-block bg-blue-50 border border-blue-200 text-blue-800 font-bold py-3 px-6 rounded-lg transition-colors hover:border-blue-300 hover:bg-blue-100"
          >
            প্রথম দোকান তৈরি করুন
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {data.map((shop) => (
            <div
              key={shop.id}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg card-lift space-y-4"
            >
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-gray-900">{shop.name}</h2>
                <p className="text-sm text-gray-600">
                  ঠিকানা: {shop.address || "ঠিকানা নেই"}
                </p>
                <p className="text-sm text-gray-600">
                  ফোন: {shop.phone || "ফোন নেই"}
                </p>
              </div>

              <div className="w-full grid grid-cols-2 gap-3 pt-4 border-t border-slate-200">
                <Link
                  href={`/dashboard/shops/${shop.id}`}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg text-center transition-colors"
                >
                  দোকান দেখুন / সম্পাদনা
                </Link>

                <form
                  action={async () => {
                    "use server";
                    await deleteShop(shop.id);
                    revalidatePath("/dashboard/shops");
                  }}
                  className="w-full"
                >
                  <button className="w-full bg-red-500 hover:bg-red-600 text-white font-medium py-3 px-4 rounded-lg transition-colors">
                    মুছুন
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
