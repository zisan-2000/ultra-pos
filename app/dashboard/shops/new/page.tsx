// app/dashboard/shops/new/page.tsx

import ShopFormClient from "../ShopFormClient";
import { handleCreateShop } from "./actions";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-session";
import { getOwnerOptions, getShopsByUser } from "@/app/actions/shops";
import {
  getOwnerShopCreationRequestOverview,
  requestAdditionalShopSlot,
} from "@/app/actions/shop-creation-requests";
import { listActiveBusinessTypes } from "@/app/actions/business-types";
import { businessOptions } from "@/lib/productFormConfig";

type PageProps = {
  searchParams?: Promise<{ requested?: string } | undefined>;
};

const formatDateTime = (iso: string | null | undefined) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("bn-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

export default async function NewShopPage({ searchParams }: PageProps) {
  const backHref = "/dashboard/shops";
  const resolvedSearchParams = await searchParams;
  const user = await getCurrentUser();
  const isSuperAdmin = user?.roles?.includes("super_admin") ?? false;
  const isOwner = user?.roles?.includes("owner") ?? false;
  const canManageSalesInvoiceEntitlement = Boolean(
    user &&
      (user.roles?.includes("super_admin") ||
        user.permissions?.includes("manage_shop_invoice_entitlement"))
  );
  const canManageSalesInvoiceFeature = Boolean(
    user &&
      (user.roles?.includes("super_admin") ||
        user.permissions?.includes("manage_shop_invoice_feature"))
  );
  const canManageQueueTokenEntitlement = Boolean(
    user &&
      (user.roles?.includes("super_admin") ||
        user.permissions?.includes("manage_shop_queue_entitlement"))
  );
  const canManageQueueTokenFeature = Boolean(
    user &&
      (user.roles?.includes("super_admin") ||
        user.permissions?.includes("manage_shop_queue_feature"))
  );
  const canManageDiscountEntitlement = Boolean(
    user &&
      (user.roles?.includes("super_admin") ||
        user.permissions?.includes("manage_shop_discount_entitlement"))
  );
  const canManageDiscountFeature = Boolean(
    user &&
      (user.roles?.includes("super_admin") ||
        user.permissions?.includes("manage_shop_discount_feature"))
  );
  const canManageTaxEntitlement = Boolean(
    user &&
      (user.roles?.includes("super_admin") ||
        user.permissions?.includes("manage_shop_tax_entitlement"))
  );
  const canManageTaxFeature = Boolean(
    user &&
      (user.roles?.includes("super_admin") ||
        user.permissions?.includes("manage_shop_tax_feature"))
  );
  const canManageBarcodeEntitlement = Boolean(
    user &&
      (user.roles?.includes("super_admin") ||
        user.permissions?.includes("manage_shop_barcode_entitlement"))
  );
  const canManageBarcodeFeature = Boolean(
    user &&
      (user.roles?.includes("super_admin") ||
        user.permissions?.includes("manage_shop_barcode_feature"))
  );
  const canManageSmsEntitlement = Boolean(
    user &&
      (user.roles?.includes("super_admin") ||
        user.permissions?.includes("manage_shop_sms_entitlement"))
  );
  const canManageSmsFeature = Boolean(
    user &&
      (user.roles?.includes("super_admin") ||
        user.permissions?.includes("manage_shop_sms_feature"))
  );
  const shops = isSuperAdmin ? [] : await getShopsByUser();

  if (!isSuperAdmin && !isOwner) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <h1 className="text-2xl font-bold text-foreground">অনুমতি নেই</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            শুধুমাত্র সুপার অ্যাডমিন বা owner নতুন দোকান যোগ করতে পারবেন।
          </p>
          <Link
            href={backHref}
            className="inline-flex items-center justify-center mt-6 px-4 py-2 rounded-lg border border-border text-foreground hover:bg-muted"
          >
            ফিরে যান
          </Link>
        </div>
      </div>
    );
  }

  const ownerOverview = !isSuperAdmin && isOwner
    ? await getOwnerShopCreationRequestOverview().catch(() => null)
    : null;
  const ownerCanCreateShop = isSuperAdmin
    ? true
    : isOwner
      ? (ownerOverview?.activeShopCount ?? shops.length) <
        (ownerOverview?.shopLimit ?? 1)
      : false;

  if (!isSuperAdmin && isOwner && !ownerCanCreateShop) {
    const latest = ownerOverview?.latestRequest ?? null;
    const latestCreatedAt = formatDateTime(latest?.createdAtIso);
    const latestDecidedAt = formatDateTime(latest?.decidedAtIso);
    const hasPending = ownerOverview?.hasPendingRequest ?? false;
    const requestTriggered = resolvedSearchParams?.requested === "1";

    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="bg-card border border-border rounded-xl p-6 space-y-3">
          <h1 className="text-2xl font-bold text-foreground">Shop limit reached</h1>
          <p className="text-sm text-muted-foreground">
            আপনার বর্তমান limit শেষ। নতুন shop তৈরি করতে super admin approval লাগবে।
          </p>
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground space-y-1">
            <p>
              Active shops:{" "}
              <span className="font-semibold">
                {ownerOverview?.activeShopCount ?? shops.length}
              </span>
            </p>
            <p>
              Approved limit:{" "}
              <span className="font-semibold">{ownerOverview?.shopLimit ?? 1}</span>
            </p>
          </div>

          {latest ? (
            <div className="rounded-lg border border-border bg-card p-3 text-sm space-y-1">
              <p className="text-muted-foreground">
                Last request status:{" "}
                <span
                  className={`font-semibold ${
                    latest.status === "approved"
                      ? "text-success"
                      : latest.status === "rejected"
                        ? "text-danger"
                        : "text-warning"
                  }`}
                >
                  {latest.status}
                </span>
              </p>
              {latest.primaryShopNameSnapshot ? (
                <p className="text-muted-foreground">
                  Snapshot shop: {latest.primaryShopNameSnapshot}
                  {latest.primaryShopPhoneSnapshot
                    ? ` (${latest.primaryShopPhoneSnapshot})`
                    : ""}
                </p>
              ) : null}
              {latestCreatedAt ? (
                <p className="text-muted-foreground">Requested: {latestCreatedAt}</p>
              ) : null}
              {latestDecidedAt && latest.status !== "pending" ? (
                <p className="text-muted-foreground">Reviewed: {latestDecidedAt}</p>
              ) : null}
              {latest.decisionNote ? (
                <p className="text-muted-foreground">Admin note: {latest.decisionNote}</p>
              ) : null}
            </div>
          ) : null}

          {requestTriggered ? (
            <div className="rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">
              Request পাঠানো হয়েছে। Super admin review করলে limit বাড়বে।
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            {hasPending ? (
              <button
                type="button"
                disabled
                className="inline-flex h-10 items-center rounded-lg border border-warning/30 bg-warning-soft px-4 text-sm font-semibold text-warning opacity-80 cursor-not-allowed"
              >
                Request Pending
              </button>
            ) : (
              <form
                action={async () => {
                  "use server";
                  await requestAdditionalShopSlot();
                  redirect("/dashboard/shops/new?requested=1");
                }}
              >
                <button
                  type="submit"
                  className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95"
                >
                  Request Additional Shop Access
                </button>
              </form>
            )}
            <Link
              href={backHref}
              className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted"
            >
              Back to shop list
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const ownerOptions = isSuperAdmin ? await getOwnerOptions() : undefined;
  const dbBusinessTypes = await listActiveBusinessTypes().catch(() => []);
  const mergedBusinessTypes = [
    ...dbBusinessTypes.map((t) => ({ id: t.key, label: t.label })),
    ...businessOptions.filter((opt) => !dbBusinessTypes.some((t) => t.key === opt.id)),
  ];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">নতুন দোকান যোগ করুন</h1>
        <p className="text-muted-foreground mt-2">মৌলিক তথ্য, ঠিকানা, যোগাযোগ ও ব্যবসার ধরন যুক্ত করুন</p>
      </div>

      <ShopFormClient
        backHref={backHref}
        action={handleCreateShop}
        cacheUserId={user?.id ?? "anon"}
        ownerOptions={ownerOptions}
        businessTypeOptions={mergedBusinessTypes}
        showSalesInvoiceSettings={
          canManageSalesInvoiceEntitlement || canManageSalesInvoiceFeature
        }
        canEditSalesInvoiceEntitlement={canManageSalesInvoiceEntitlement}
        showQueueTokenSettings={
          canManageQueueTokenEntitlement || canManageQueueTokenFeature
        }
        canEditQueueTokenEntitlement={canManageQueueTokenEntitlement}
        showDiscountSettings={canManageDiscountEntitlement || canManageDiscountFeature}
        canEditDiscountEntitlement={canManageDiscountEntitlement}
        showTaxSettings={canManageTaxEntitlement || canManageTaxFeature}
        canEditTaxEntitlement={canManageTaxEntitlement}
        showBarcodeSettings={canManageBarcodeEntitlement || canManageBarcodeFeature}
        canEditBarcodeEntitlement={canManageBarcodeEntitlement}
        showSmsSummarySettings={canManageSmsEntitlement || canManageSmsFeature}
        canEditSmsSummaryEntitlement={canManageSmsEntitlement}
      />
    </div>
  );
}
