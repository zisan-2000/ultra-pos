import EditProductClient from "./EditProductClient";
import { getProduct } from "@/app/actions/products";
import { getShop } from "@/app/actions/shops";
import { getBusinessTypeConfig } from "@/app/actions/business-types";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditProductPage({ params }: PageProps) {
  const { id } = await params;
  const product = await getProduct(id);
  const shop = await getShop(product.shopId);

  if (!product) return <div>Product not found.</div>;
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
