import EditProductClient from "./EditProductClient";
import { getProduct } from "@/app/actions/products";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditProductPage({ params }: PageProps) {
  const { id } = await params;
  const product = await getProduct(id);

  if (!product) return <div>Product not found.</div>;

  return <EditProductClient product={product} />;
}
