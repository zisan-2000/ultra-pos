// app/dashboard/shops/[id]/page.tsx

import { getShop, updateShop } from "@/app/actions/shops";
import { redirect } from "next/navigation";
import Link from "next/link";
import ShopFormClient from "../ShopFormClient";
import { listActiveBusinessTypes } from "@/app/actions/business-types";
import { businessOptions } from "@/lib/productFormConfig";
import { getCurrentUser } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SALES_INVOICE_PRINT_SIZE } from "@/lib/sales-invoice-print";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditShop({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  const canManageShopSettings = Boolean(
    user && (user.roles?.includes("super_admin") || user.roles?.includes("owner"))
  );
  const canManageSalesInvoice = Boolean(
    user &&
      (user.roles?.includes("super_admin") ||
        user.permissions?.includes("manage_shop_invoice_feature"))
  );
  const canManageQueueToken = Boolean(
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
      ...(canManageSalesInvoice
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
      ...(canManageQueueToken
        ? {
            queueTokenEnabled: formData.get("queueTokenEnabled") === "1",
            queueTokenPrefix:
              ((formData.get("queueTokenPrefix") as string) || "").trim() ||
              null,
            queueWorkflow:
              ((formData.get("queueWorkflow") as string) || "").trim() || null,
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
    });

    redirect("/dashboard/shops");
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">দোকানের তথ্য সম্পাদনা</h1>
        <p className="text-muted-foreground mt-2">নাম + ঠিকানা আপডেট করুন</p>
      </div>

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
          salesInvoiceEnabled: Boolean((shop as any).salesInvoiceEnabled),
          salesInvoicePrefix: (shop as any).salesInvoicePrefix || "INV",
          salesInvoicePrintSize,
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
        }}
        submitLabel="সংরক্ষণ করুন"
        businessTypeOptions={businessTypeOptions}
        showSalesInvoiceSettings={canManageSalesInvoice}
        showQueueTokenSettings={canManageQueueToken}
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
