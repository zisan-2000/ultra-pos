import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getDueSaleEditDraft,
  reissueDueSale,
} from "@/app/actions/sales";
import { getActiveProductsByShop } from "@/app/actions/products";
import { getCustomersByShop } from "@/app/actions/customers";
import DueSaleReissueClient from "./DueSaleReissueClient";

type PageProps = {
  params: Promise<{ saleId: string }>;
};

export default async function DueSaleEditPage({ params }: PageProps) {
  const { saleId } = await params;

  let draft: Awaited<ReturnType<typeof getDueSaleEditDraft>>;
  try {
    draft = await getDueSaleEditDraft(saleId);
  } catch (error) {
    if (error instanceof Error && /not found/i.test(error.message)) {
      notFound();
    }
    if (error instanceof Error && /forbidden|permission/i.test(error.message)) {
      return (
        <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6 bn-typography">
          <div className="rounded-2xl border border-border bg-card p-6 text-center">
            <h1 className="text-2xl font-bold text-foreground">Due Sale Edit</h1>
            <p className="mt-2 text-danger font-semibold">Access restricted</p>
            <p className="mt-2 text-sm text-muted-foreground">
              এই পেজে ঢুকতে sales এবং due edit permission লাগবে।
            </p>
            <Link
              href="/dashboard/sales"
              className="inline-flex mt-5 h-10 items-center rounded-full border border-primary/30 bg-primary-soft px-4 text-sm font-semibold text-primary hover:bg-primary/15 hover:border-primary/40"
            >
              Back to Sales
            </Link>
          </div>
        </div>
      );
    }
    throw error;
  }

  const [products, customers] = await Promise.all([
    getActiveProductsByShop(draft.sale.shopId),
    getCustomersByShop(draft.sale.shopId),
  ]);

  async function submitReissue(formData: FormData) {
    "use server";

    const originalSaleId = (formData.get("originalSaleId") as string) || "";
    const customerId = (formData.get("customerId") as string) || "";
    const paidNowRaw = (formData.get("paidNow") as string) || "0";
    const note = (formData.get("note") as string) || "";
    const reason = (formData.get("reason") as string) || "";
    const itemsRaw = (formData.get("items") as string) || "[]";

    let parsedItems: unknown = [];
    try {
      parsedItems = JSON.parse(itemsRaw);
    } catch {
      throw new Error("Invalid reissue items payload");
    }

    const items = Array.isArray(parsedItems)
      ? parsedItems.map((row) => {
          const item = row as {
            productId?: string;
            qty?: number | string;
            unitPrice?: number | string;
            name?: string;
          };
          return {
            productId: (item.productId || "").toString(),
            qty: Number(item.qty ?? 0),
            unitPrice: Number(item.unitPrice ?? 0),
            name: (item.name || "").toString(),
          };
        })
      : [];

    return reissueDueSale({
      originalSaleId,
      customerId,
      items,
      paidNow: Number(paidNowRaw || 0),
      note,
      reason,
    });
  }

  return (
    <DueSaleReissueClient
      draft={draft}
      products={products}
      customers={customers}
      submitReissue={submitReissue}
    />
  );
}

