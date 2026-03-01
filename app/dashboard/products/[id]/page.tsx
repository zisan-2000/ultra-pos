import EditProductClient from "./EditProductClient";
import { getProduct } from "@/app/actions/products";
import { getShop } from "@/app/actions/shops";
import { getBusinessTypeConfig } from "@/app/actions/business-types";
import Link from "next/link";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditProductPage({ params }: PageProps) {
  const user = await requireUser();
  const canViewProducts = hasPermission(user, "view_products");
  const canUpdateProduct = hasPermission(user, "update_product");
  const canUseBarcodeScanPermission = hasPermission(user, "use_pos_barcode_scan");

  if (!canViewProducts) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">পণ্য সম্পাদনা</h1>
        <p className="mb-2 text-danger font-semibold">অ্যাকসেস সীমাবদ্ধ</p>
        <p className="mb-6 text-muted-foreground">
          পণ্য দেখার জন্য <code>view_products</code> permission লাগবে।
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors"
        >
          ড্যাশবোর্ডে ফিরুন
        </Link>
      </div>
    );
  }

  if (!canUpdateProduct) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">পণ্য সম্পাদনা</h1>
        <p className="mb-2 text-danger font-semibold">অ্যাকসেস সীমাবদ্ধ</p>
        <p className="mb-6 text-muted-foreground">
          পণ্য সম্পাদনা করতে <code>update_product</code> permission লাগবে।
        </p>
        <Link
          href="/dashboard/products"
          className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors"
        >
          পণ্য তালিকায় ফিরুন
        </Link>
      </div>
    );
  }

  const { id } = await params;
  let product: Awaited<ReturnType<typeof getProduct>> | null = null;
  try {
    product = await getProduct(id);
  } catch (err) {
    if (err instanceof Error && /not found/i.test(err.message)) {
      product = null;
    } else {
      throw err;
    }
  }

  if (!product) return <div>Product not found.</div>;

  let shop: Awaited<ReturnType<typeof getShop>> | null = null;
  try {
    shop = await getShop(product.shopId);
  } catch (err) {
    if (err instanceof Error && /not found/i.test(err.message)) {
      shop = null;
    } else {
      throw err;
    }
  }

  if (!shop) return <div>Shop not found.</div>;

  const businessConfig = await getBusinessTypeConfig(shop.businessType ?? null);
  const canUseBarcodeScan =
    Boolean((shop as any).barcodeFeatureEntitled) &&
    Boolean((shop as any).barcodeScanEnabled) &&
    canUseBarcodeScanPermission;

  const serializedProduct = JSON.parse(JSON.stringify(product));
  const serializedShop = {
    id: shop.id,
    name: shop.name,
    businessType: shop.businessType ?? null,
  };

  return (
    <EditProductClient
      product={serializedProduct}
      shop={serializedShop}
      businessConfig={businessConfig || undefined}
      canUseBarcodeScan={canUseBarcodeScan}
    />
  );
}
