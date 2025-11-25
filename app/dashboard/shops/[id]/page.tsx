// app/dashboard/shops/[id]/page.tsx

import { getShop, updateShop } from "@/app/actions/shops";
import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditShop({ params }: PageProps) {
  const { id } = await params;
  const shop = await getShop(id);

  async function handleUpdate(formData: FormData) {
    "use server";

    await updateShop(id, {
      name: formData.get("name"),
      address: formData.get("address"),
      phone: formData.get("phone"),
    });

    redirect("/dashboard/shops");
  }

  return (
    <form action={handleUpdate} className="space-y-4 max-w-lg">
      <h1 className="text-xl font-bold">Edit Shop</h1>

      <input
        name="name"
        defaultValue={shop?.name}
        className="border p-2 w-full"
      />

      <input
        name="address"
        defaultValue={shop?.address ?? ""}
        className="border p-2 w-full"
      />

      <input
        name="phone"
        defaultValue={shop?.phone ?? ""}
        className="border p-2 w-full"
      />

      <button className="px-4 py-2 bg-black text-white rounded">
        Update Shop
      </button>
    </form>
  );
}
