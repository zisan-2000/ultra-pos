// app/dashboard/shops/[id]/page.tsx

import { getShop, updateShop } from "@/app/actions/shops";
import { businessOptions, type BusinessType } from "@/lib/productFormConfig";
import Link from "next/link";
import { redirect } from "next/navigation";

type PageProps = { params: { id: string } };

export default async function EditShop({ params }: PageProps) {
  const { id } = params;
  const shop = await getShop(id);
  if (!shop) {
    return <div className="p-6 text-center text-red-600">Shop not found</div>;
  }
  const backHref = "/dashboard/shops";

  async function handleUpdate(formData: FormData) {
    "use server";

    await updateShop(id, {
      name: formData.get("name"),
      address: formData.get("address"),
      phone: formData.get("phone"),
      businessType: (formData.get("businessType") as BusinessType) || "tea_stall",
    });

    redirect("/dashboard/shops");
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Edit Shop Details</h1>
        <p className="text-gray-600 mt-2">Update your shop name, address, phone, and business type.</p>
      </div>

      <form action={handleUpdate} className="bg-white rounded-lg border border-gray-200 p-8 space-y-6">
        
        {/* Shop Name */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">Shop Name *</label>
          <input
            name="name"
            defaultValue={shop?.name}
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., M/S Rahman Store"
            required
          />
          <p className="text-sm text-gray-500">Give your shop a clear, short name.</p>
        </div>

        {/* Address */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">Address (optional)</label>
          <input
            name="address"
            defaultValue={shop?.address ?? ""}
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., 12/3 Station Rd, Dhaka"
          />
          <p className="text-sm text-gray-500">Helps staff/customers identify the location.</p>
        </div>

        {/* Phone */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">Shop Phone (optional)</label>
          <input
            name="phone"
            defaultValue={shop?.phone ?? ""}
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., 01700000000"
          />
          <p className="text-sm text-gray-500">Use a number customers or staff can reach.</p>
        </div>

        {/* Business Type */}
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">Business Type</label>
          <select
            name="businessType"
            defaultValue={(shop?.businessType as BusinessType) || "tea_stall"}
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            {businessOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
          <p className="text-sm text-gray-500">This controls which product fields appear for this shop.</p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-4">
          <button 
            type="submit"
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-lg text-lg transition-colors"
          >
            Save changes
          </button>
          <Link 
            href={backHref}
            className="flex-1 border border-slate-300 text-slate-900 font-medium py-4 px-6 rounded-lg text-lg hover:bg-slate-100 transition-colors text-center"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
