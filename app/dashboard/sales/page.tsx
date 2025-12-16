// app/dashboard/sales/page.tsx

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import { getSalesByShop, voidSale } from "@/app/actions/sales";
import ShopSelectorClient from "./ShopSelectorClient";
import { VoidSaleControls } from "./components/VoidSaleControls";

type SalesPageProps = {
  searchParams?: Promise<{ shopId?: string } | undefined>;
};

async function voidSaleAction(formData: FormData) {
  "use server";
  const saleId = formData.get("saleId");
  const reason = formData.get("reason");
  if (!saleId || typeof saleId !== "string") return;

  try {
    await voidSale(
      saleId,
      typeof reason === "string" && reason.trim() ? reason.trim() : null
    );
  } catch (error) {
    console.error("Failed to void sale", error);
  } finally {
    revalidatePath("/dashboard/sales", "page");
  }
}

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const shops = await getShopsByUser();
  const resolvedSearch = await searchParams;

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">বিক্রি তালিকা</h1>
        <p className="mb-6 text-gray-600">এখনও কোনো দোকান নেই।</p>
        <Link
          href="/dashboard/shops/new"
          className="inline-block px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
        >
          প্রথম দোকান তৈরি করুন
        </Link>
      </div>
    );
  }

  const cookieStore = await cookies();
  const cookieShopId = cookieStore.get("activeShopId")?.value;

  const cookieSelectedShopId =
    cookieShopId && shops.some((s) => s.id === cookieShopId)
      ? cookieShopId
      : null;

  const selectedShopId =
    resolvedSearch?.shopId &&
    shops.some((s) => s.id === resolvedSearch.shopId)
      ? resolvedSearch.shopId
      : cookieSelectedShopId ?? shops[0].id;

  const selectedShop = shops.find((s) => s.id === selectedShopId)!;

  const sales = await getSalesByShop(selectedShopId);

  return (
    <div className="space-y-6 section-gap">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-700">🧾</span>
            <h1 className="text-3xl font-bold text-gray-900 leading-tight">বিক্রি তালিকা</h1>
          </div>
          <p className="text-sm text-gray-500 mt-2 leading-snug">
            দোকান: <span className="font-semibold">{selectedShop.name}</span>
          </p>
        </div>

        <div className="flex gap-3 items-center w-full lg:w-auto">
          <ShopSelectorClient shops={shops} selectedShopId={selectedShopId} />

          <Link
            href={`/dashboard/sales/new?shopId=${selectedShopId}`}
            className="w-full lg:w-auto px-6 py-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg font-semibold hover:border-blue-300 hover:bg-blue-100 transition-colors text-center"
          >
            ➕ নতুন বিক্রি
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        {sales.length === 0 ? (
          <p className="text-center text-gray-600 py-8 bg-white border border-slate-200 rounded-xl">
            এখনও কোনো বিক্রি নেই।
          </p>
        ) : (
          sales.map((s) => {
            const totalNum = Number(s.totalAmount ?? 0);
            const totalStr = Number.isFinite(totalNum)
              ? totalNum.toFixed(2)
              : s.totalAmount?.toString?.() ?? "0.00";
            const createdAtStr = s.createdAt
              ? new Date(s.createdAt as any).toLocaleString("bn-BD")
              : "";

            const isVoided = (s as any).status === "VOIDED";
            const voidReason = (s as any).voidReason as string | null;
            const canVoid = s.paymentMethod !== "due";
            const effectiveIsVoided = isVoided || !canVoid;
            const voidFormId = `void-sale-form-${s.id}`;

            return (
              <div
                key={s.id}
                className={`bg-white rounded-xl p-5 flex justify-between items-start gap-4 shadow-sm hover:shadow-md card-lift border ${
                  isVoided ? "border-gray-200" : "border-red-200 bg-red-50/60"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold text-gray-900">{totalStr} ৳</p>
                    {isVoided && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                        বাতিলকৃত বিক্রি
                      </span>
                    )}
                  </div>
                  <p className="text-base text-gray-600">
                    পেমেন্ট: {s.paymentMethod === "due" ? "ধার" : s.paymentMethod === "cash" ? "ক্যাশ" : s.paymentMethod}
                    {s.paymentMethod === "due" && s.customerName
                      ? ` • গ্রাহক: ${s.customerName}`
                      : ""}
                  </p>
                  {s.itemCount > 0 && (
                    <p className="text-sm text-gray-500">
                      পণ্য: {s.itemPreview || `${s.itemCount} টি`}
                    </p>
                  )}
                  {isVoided && voidReason && (
                    <p className="text-xs text-red-600 mt-1">
                      কারণ: {voidReason}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <p className="text-sm text-gray-500 text-right">
                    {createdAtStr}
                  </p>
                  {!isVoided && (
                    <form
                      id={voidFormId}
                      action={voidSaleAction}
                      className="flex items-center gap-2"
                    >
                      <VoidSaleControls
                        saleId={s.id}
                        isVoided={effectiveIsVoided}
                        formId={voidFormId}
                      />
                    </form>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
