import EditProductClient from "./EditProductClient";
import { getProduct } from "@/app/actions/products";

export default async function EditProductPage({ params }: any) {
  const product = await getProduct(params.id);

  if (!product) return <div>Product not found.</div>;

  return <EditProductClient product={product} />;
}
