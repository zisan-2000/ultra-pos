// app/dashboard/shops/[id]/page.tsx

import { getShop, updateShop } from "@/app/actions/shops";
import { getLatestFeatureAccessRequestSnapshots } from "@/app/actions/feature-access-requests";
import { redirect } from "next/navigation";
import Link from "next/link";
import ShopFormClient from "../ShopFormClient";
import { listActiveBusinessTypes } from "@/app/actions/business-types";
import { businessOptions } from "@/lib/productFormConfig";
import { getCurrentUser } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SALES_INVOICE_PRINT_SIZE } from "@/lib/sales-invoice-print";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ setup?: string } | undefined>;
};

export default async function EditShop({ params, searchParams }: PageProps) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const setupMode = resolvedSearchParams?.setup === "1";
  const user = await getCurrentUser();
  const canManageShopSettings = Boolean(
    user && (user.roles?.includes("super_admin") || user.roles?.includes("owner"))
  );
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
  const canManageInventoryEntitlement = Boolean(
    user && user.roles?.includes("super_admin")
  );
  const canManageInventoryFeature = Boolean(
    user &&
      (user.roles?.includes("super_admin") || user.roles?.includes("owner"))
  );
  const canManageCogsEntitlement = Boolean(
    user && user.roles?.includes("super_admin")
  );
  const canManageCogsFeature = Boolean(
    user &&
      (user.roles?.includes("super_admin") || user.roles?.includes("owner"))
  );
  let shop: Awaited<ReturnType<typeof getShop>> | null = null;
  try {
    shop = await getShop(id);
  } catch (err) {
    if (err instanceof Error && /not found/i.test(err.message)) {
      shop = null;
    } else {
      throw err;
    }
  }
  if (!shop) {
    return <div className="p-6 text-center text-danger">Shop not found</div>;
  }

  const shopPrintRows = await prisma.$queryRaw<
    Array<{ sales_invoice_print_size: string | null }>
  >`
    SELECT "sales_invoice_print_size"
    FROM "shops"
    WHERE "id" = CAST(${id} AS uuid)
    LIMIT 1
  `;
  const salesInvoicePrintSize =
    shopPrintRows[0]?.sales_invoice_print_size || DEFAULT_SALES_INVOICE_PRINT_SIZE;

  if (!canManageShopSettings) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="mb-2">
          <h1 className="text-3xl font-bold text-foreground">দোকানের তথ্য</h1>
          <p className="text-muted-foreground mt-2">
            এই পেজটি শুধুমাত্র দেখার জন্য। সেটিংস পরিবর্তনের অনুমতি নেই।
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div>
            <p className="text-xs text-muted-foreground">নাম</p>
            <p className="text-base font-semibold text-foreground">
              {shop.name || "-"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">ঠিকানা</p>
            <p className="text-sm text-foreground">{shop.address || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">ফোন</p>
            <p className="text-sm text-foreground">{shop.phone || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">ব্যবসার ধরন</p>
            <p className="text-sm text-foreground">{shop.businessType || "-"}</p>
          </div>
        </div>
        <Link
          href="/dashboard/shops"
          className="inline-flex h-11 items-center rounded-lg border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted"
        >
          দোকান তালিকায় ফিরে যান
        </Link>
      </div>
    );
  }

  const dbBusinessTypes = await listActiveBusinessTypes().catch(() => []);
  const featureAccessRequests = await getLatestFeatureAccessRequestSnapshots(id).catch(
    () => ({})
  );
  const businessTypeOptions = [
    ...dbBusinessTypes.map((t) => ({ id: t.key, label: t.label })),
    ...businessOptions.filter((opt) => !dbBusinessTypes.some((t) => t.key === opt.id)),
  ];

  const backHref = "/dashboard/shops";

  async function handleUpdate(formData: FormData) {
    "use server";

    await updateShop(id, {
      name: formData.get("name"),
      address: formData.get("address"),
      phone: formData.get("phone"),
      businessType: (formData.get("businessType") as any) || "tea_stall",
      ...(canManageSalesInvoiceEntitlement || canManageSalesInvoiceFeature
        ? {
            ...(canManageSalesInvoiceEntitlement
              ? {
                  salesInvoiceEntitled:
                    formData.get("salesInvoiceEntitled") === "1",
                }
              : {}),
            ...(canManageSalesInvoiceFeature
              ? {
                  salesInvoiceEnabled: formData.get("salesInvoiceEnabled") === "1",
                  salesInvoicePrefix:
                    ((formData.get("salesInvoicePrefix") as string) || "").trim() ||
                    null,
                  salesInvoicePrintSize:
                    ((formData.get("salesInvoicePrintSize") as string) || "").trim() ||
                    null,
                }
              : {}),
          }
        : {}),
      ...(canManageQueueTokenEntitlement || canManageQueueTokenFeature
        ? {
            ...(canManageQueueTokenEntitlement
              ? {
                  queueTokenEntitled: formData.get("queueTokenEntitled") === "1",
                }
              : {}),
            ...(canManageQueueTokenFeature
              ? {
                  queueTokenEnabled: formData.get("queueTokenEnabled") === "1",
                  queueTokenPrefix:
                    ((formData.get("queueTokenPrefix") as string) || "").trim() ||
                    null,
                  queueWorkflow:
                    ((formData.get("queueWorkflow") as string) || "").trim() || null,
                }
              : {}),
          }
        : {}),
      ...(canManageDiscountEntitlement || canManageDiscountFeature
        ? {
            ...(canManageDiscountEntitlement
              ? {
                  discountFeatureEntitled:
                    formData.get("discountFeatureEntitled") === "1",
                }
              : {}),
            ...(canManageDiscountFeature
              ? {
                discountEnabled: formData.get("discountEnabled") === "1",
              }
            : {}),
        }
      : {}),
      ...(canManageTaxEntitlement || canManageTaxFeature
        ? {
            ...(canManageTaxEntitlement
              ? {
                  taxFeatureEntitled: formData.get("taxFeatureEntitled") === "1",
                }
              : {}),
            ...(canManageTaxFeature
              ? {
                  taxEnabled: formData.get("taxEnabled") === "1",
                  taxLabel:
                    ((formData.get("taxLabel") as string) || "").trim() || null,
                  taxRate:
                    ((formData.get("taxRate") as string) || "").trim() || null,
                }
              : {}),
          }
        : {}),
      ...(canManageBarcodeEntitlement || canManageBarcodeFeature
        ? {
            ...(canManageBarcodeEntitlement
              ? {
                  barcodeFeatureEntitled:
                    formData.get("barcodeFeatureEntitled") === "1",
                }
              : {}),
            ...(canManageBarcodeFeature
              ? {
                  barcodeScanEnabled: formData.get("barcodeScanEnabled") === "1",
                }
              : {}),
          }
        : {}),
      ...(canManageSmsEntitlement || canManageSmsFeature
        ? {
            ...(canManageSmsEntitlement
              ? {
                  smsSummaryEntitled:
                    formData.get("smsSummaryEntitled") === "1",
                }
              : {}),
            ...(canManageSmsFeature
              ? {
                  smsSummaryEnabled: formData.get("smsSummaryEnabled") === "1",
                }
              : {}),
          }
        : {}),
      ...(canManageInventoryEntitlement || canManageInventoryFeature
        ? {
            ...(canManageInventoryEntitlement
              ? {
                  inventoryFeatureEntitled:
                    formData.get("inventoryFeatureEntitled") === "1",
                }
              : {}),
            ...(canManageInventoryFeature
              ? {
                  inventoryEnabled: formData.get("inventoryEnabled") === "1",
                }
              : {}),
          }
        : {}),
      ...(canManageCogsEntitlement || canManageCogsFeature
        ? {
            ...(canManageCogsEntitlement
              ? {
                  cogsFeatureEntitled:
                    formData.get("cogsFeatureEntitled") === "1",
                }
              : {}),
            ...(canManageCogsFeature
              ? {
                  cogsEnabled: formData.get("cogsEnabled") === "1",
                }
              : {}),
          }
        : {}),
    });

    redirect("/dashboard/shops");
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">
          {setupMode ? "দোকান সেটআপ সম্পন্ন করুন" : "দোকানের তথ্য সম্পাদনা"}
        </h1>
        <p className="text-muted-foreground mt-2">
          {setupMode
            ? "এখন প্রয়োজনীয় feature-গুলোর Access Request দিন। Approve হলে সঙ্গে সঙ্গে চালু করতে পারবেন।"
            : "নাম + ঠিকানা আপডেট করুন"}
        </p>
      </div>
      {setupMode ? (
        <div className="mb-4 rounded-xl border border-success/30 bg-success-soft p-4">
          <p className="text-sm font-semibold text-success">
            দোকান সফলভাবে তৈরি হয়েছে।
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            নিচের Feature Settings থেকে প্রয়োজনীয় ফিচারে `Request Access` দিন।
          </p>
        </div>
      ) : null}

      <ShopFormClient
        backHref={backHref}
        action={handleUpdate}
        cacheUserId={user?.id ?? "anon"}
        shopId={id}
        initial={{
          name: shop.name || "",
          address: shop.address || "",
          phone: shop.phone || "",
          businessType: (shop.businessType as any) || "tea_stall",
          salesInvoiceEntitled: Boolean((shop as any).salesInvoiceEntitled),
          salesInvoiceEnabled: Boolean((shop as any).salesInvoiceEnabled),
          salesInvoicePrefix: (shop as any).salesInvoicePrefix || "INV",
          salesInvoicePrintSize,
          queueTokenEntitled: Boolean((shop as any).queueTokenEntitled),
          queueTokenEnabled: Boolean((shop as any).queueTokenEnabled),
          queueTokenPrefix: (shop as any).queueTokenPrefix || "TK",
          queueWorkflow: (shop as any).queueWorkflow || null,
          discountFeatureEntitled: Boolean((shop as any).discountFeatureEntitled),
          discountEnabled: Boolean((shop as any).discountEnabled),
          taxFeatureEntitled: Boolean((shop as any).taxFeatureEntitled),
          taxEnabled: Boolean((shop as any).taxEnabled),
          taxLabel: (shop as any).taxLabel || "VAT",
          taxRate: (shop as any).taxRate?.toString?.() || "",
          barcodeFeatureEntitled: Boolean((shop as any).barcodeFeatureEntitled),
          barcodeScanEnabled: Boolean((shop as any).barcodeScanEnabled),
          smsSummaryEntitled: Boolean((shop as any).smsSummaryEntitled),
          smsSummaryEnabled: Boolean((shop as any).smsSummaryEnabled),
          inventoryFeatureEntitled: Boolean((shop as any).inventoryFeatureEntitled),
          inventoryEnabled: Boolean((shop as any).inventoryEnabled),
          cogsFeatureEntitled: Boolean((shop as any).cogsFeatureEntitled),
          cogsEnabled: Boolean((shop as any).cogsEnabled),
        }}
        submitLabel="সংরক্ষণ করুন"
        businessTypeOptions={businessTypeOptions}
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
        showInventorySettings={
          canManageInventoryEntitlement || canManageInventoryFeature
        }
        canEditInventoryEntitlement={canManageInventoryEntitlement}
        showCogsSettings={canManageCogsEntitlement || canManageCogsFeature}
        canEditCogsEntitlement={canManageCogsEntitlement}
        featureAccessRequestByKey={featureAccessRequests}
      />
    </div>
  );
}
