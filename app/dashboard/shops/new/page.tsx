// app/dashboard/shops/new/page.tsx

import { createShop } from "@/app/actions/shops";
import { redirect } from "next/navigation";

export default function NewShopPage() {
  async function handleSubmit(formData: FormData) {
    "use server";

    await createShop({
      name: formData.get("name") as string,
      address: formData.get("address") as string,
      phone: formData.get("phone") as string,
    });

    redirect("/dashboard/shops");
  }

  return (
    <form action={handleSubmit} className="space-y-4 max-w-lg">
      <h1 className="text-xl font-bold">Create New Shop</h1>

      <input
        name="name"
        className="border p-2 w-full"
        placeholder="Shop Name"
      />

      <input
        name="address"
        className="border p-2 w-full"
        placeholder="Address"
      />

      <input name="phone" className="border p-2 w-full" placeholder="Phone" />

      <button className="px-4 py-2 bg-black text-white rounded">
        Create Shop
      </button>
    </form>
  );
}
