import EditProductClient from "./EditProductClient";
import { getProduct } from "@/app/actions/products";
import { getShop } from "@/app/actions/shops";
import { getBusinessTypeConfig } from "@/app/actions/business-types";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditProductPage({ params }: PageProps) {
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
    />
  );
}
